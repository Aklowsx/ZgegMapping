import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import type { IpcMainInvokeEvent, Rectangle } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type JsonResult = {
  success: boolean;
  message: string;
  [key: string]: unknown;
};

type PdfControlPoint = {
  id: string;
  name: string;
  comment?: string;
  sourcePixel: {
    x: number;
    y: number;
  };
  targetLatLng: {
    lat: number;
    lng: number;
  };
};

type CoordinateProjection = "EPSG:4326" | "EPSG:3857" | "EPSG:2154" | "EPSG:27572";

type ImportedPoint = {
  id: string;
  name: string;
  source: {
    x: number;
    y: number;
  };
  sourceProjection: CoordinateProjection;
  exportEnabled?: boolean;
  targetLatLng: {
    lat: number;
    lng: number;
  };
  properties: Record<string, string>;
};

type PdfPointLayer = {
  id: string;
  name: string;
  sourceProjection: CoordinateProjection;
  visible: boolean;
  color: string;
  showLabels: boolean;
  labelColumn?: string;
  points: ImportedPoint[];
};

type PdfInfoPoint = {
  id: string;
  name: string;
  comment?: string;
  exportEnabled?: boolean;
  targetLatLng: {
    lat: number;
    lng: number;
  };
};

type PdfLayer = {
  id: string;
  name: string;
  originalFilePath: string;
  convertedImagePath?: string;
  processedImagePath?: string;
  backgroundRemoval?: {
    enabled: boolean;
    color: string;
    tolerance: number;
    processedImagePath?: string;
  };
  georefFilePath?: string;
  overlayImagePath?: string;
  overlayImageUrl?: string;
  overlayBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  tilesPath?: string;
  tileUrlTemplate?: string;
  opacity: number;
  visible: boolean;
  controlPoints: PdfControlPoint[];
};

type PdfProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: PdfLayer[];
  pointLayers?: PdfPointLayer[];
  infoPoints?: PdfInfoPoint[];
};

type CsvRow = {
  values: Record<string, string>;
  properties: Record<string, string>;
};

type ExportMapArea = {
  mode: "selection" | "viewport";
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  captureRect: Rectangle;
};

type PdfBaseMap = {
  id: string;
  name: string;
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  className?: string;
};

type ExportPdfPayload = {
  project: PdfProject;
  selectedLayerId: string | null;
  area: ExportMapArea;
  baseMap: PdfBaseMap;
  baseMapOpacity?: number;
};

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff"]);
const pdfExtensions = new Set([".pdf"]);
const csvExtensions = new Set([".csv", ".txt"]);

function appRoot() {
  return app.getAppPath();
}

function projectsRoot() {
  return path.join(appRoot(), "projects");
}

function backendRoot() {
  return path.join(appRoot(), "backend");
}

function sanitizeProjectName(name: string) {
  return (name || "default-project").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "default-project";
}

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
}

async function ensureProjectDirs(projectName: string) {
  const root = path.join(projectsRoot(), sanitizeProjectName(projectName));
  const dirs = ["originals", "points", "converted", "georeferenced", "overlays", "tiles", "logs", "control_points", "exports"];
  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(root, dir), { recursive: true })));
  return root;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function detectDelimiter(firstLine: string) {
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: splitCsvLine(firstLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseCsv(content: string): CsvRow[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const normalizedHeaders = headers.map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: CsvRow = { values: {}, properties: {} };
    normalizedHeaders.forEach((header, index) => {
      const originalHeader = headers[index]?.trim() || header;
      const value = values[index] ?? "";
      if (header) {
        row.values[header] = value;
      }
      if (originalHeader) {
        row.properties[originalHeader] = value;
      }
    });
    return row;
  });
}

function pickValue(row: CsvRow, names: string[]) {
  for (const name of names.map(normalizeHeader)) {
    if (row.values[name] !== undefined && row.values[name] !== "") {
      return row.values[name];
    }
  }
  return undefined;
}

function parseCoordinateText(value: string | undefined) {
  if (!value) {
    return null;
  }

  const isWktPoint = /point\s*\(/i.test(value);
  const matches = value.match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) {
    return null;
  }

  const first = parseNumber(matches[0]);
  const second = parseNumber(matches[1]);
  if (first === null || second === null) {
    return null;
  }

  if (isWktPoint) {
    return { x: first, y: second };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { x: second, y: first };
  }

  return { x: first, y: second };
}

function normalizeProjection(value: string | undefined): CoordinateProjection | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeHeader(value);
  if (["4326", "epsg4326", "wgs84", "latlon", "latlng"].includes(normalized)) {
    return "EPSG:4326";
  }
  if (["3857", "epsg3857", "webmercator", "mercator", "pseudoMercator".toLowerCase()].includes(normalized)) {
    return "EPSG:3857";
  }
  if (["2154", "epsg2154", "lambert93", "lambertzone93", "l93"].includes(normalized)) {
    return "EPSG:2154";
  }
  if (["27572", "epsg27572", "lambert2", "lambertii", "lambert2etendu", "lambertiietendu", "l2e"].includes(normalized)) {
    return "EPSG:27572";
  }
  return null;
}

function projectionFromRow(row: CsvRow) {
  const explicitProjection = normalizeProjection(pickValue(row, ["projection", "epsg", "srid", "srs", "crs"]));
  if (explicitProjection) {
    return explicitProjection;
  }

  const lambertCode = normalizeHeader(pickValue(row, ["lambertOuvrage", "lambert", "codeLambert"]) ?? "");
  if (["5", "l2e", "27572", "epsg27572", "lambert2etendu", "lambertiietendu"].includes(lambertCode)) {
    return "EPSG:27572";
  }

  return null;
}

function detectProjection(x: number, y: number, explicitProjection: CoordinateProjection | null): CoordinateProjection {
  if (explicitProjection) {
    return explicitProjection;
  }
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return "EPSG:4326";
  }
  if (x >= 0 && x <= 1300000 && y >= 6000000 && y <= 7200000) {
    return "EPSG:2154";
  }
  if (x >= 0 && x <= 1300000 && y >= 1500000 && y <= 2700000) {
    return "EPSG:27572";
  }
  return "EPSG:3857";
}

function webMercatorToWgs84(x: number, y: number) {
  const lng = (x / 20037508.342789244) * 180;
  const mercatorLat = (y / 20037508.342789244) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((mercatorLat * Math.PI) / 180)) - Math.PI / 2);
  return { lat, lng };
}

function lambert93ToWgs84(x: number, y: number) {
  const a = 6378137;
  const e = Math.sqrt(0.0066943800229);
  const lat0 = (46.5 * Math.PI) / 180;
  const lon0 = (3 * Math.PI) / 180;
  const lat1 = (44 * Math.PI) / 180;
  const lat2 = (49 * Math.PI) / 180;
  const falseEasting = 700000;
  const falseNorthing = 6600000;

  function m(lat: number) {
    const sinLat = Math.sin(lat);
    return Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
  }

  function t(lat: number) {
    const sinLat = Math.sin(lat);
    return Math.tan(Math.PI / 4 - lat / 2) / Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2);
  }

  const n = (Math.log(m(lat1)) - Math.log(m(lat2))) / (Math.log(t(lat1)) - Math.log(t(lat2)));
  const f = m(lat1) / (n * Math.pow(t(lat1), n));
  const rho0 = a * f * Math.pow(t(lat0), n);
  const dx = x - falseEasting;
  const dy = rho0 - (y - falseNorthing);
  const rho = Math.sign(n) * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dx, dy);
  const lng = lon0 + theta / n;
  const targetT = Math.pow(rho / (a * f), 1 / n);

  let lat = Math.PI / 2 - 2 * Math.atan(targetT);
  for (let index = 0; index < 8; index += 1) {
    const sinLat = Math.sin(lat);
    lat = Math.PI / 2 - 2 * Math.atan(targetT * Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2));
  }

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}

function geodeticToCartesian(lat: number, lng: number, a: number, e2: number) {
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  return {
    x: n * cosLat * Math.cos(lng),
    y: n * cosLat * Math.sin(lng),
    z: n * (1 - e2) * sinLat,
  };
}

function cartesianToWgs84(x: number, y: number, z: number) {
  const a = 6378137;
  const e2 = 0.0066943799901413165;
  const p = Math.sqrt(x * x + y * y);
  const lng = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - e2));

  for (let index = 0; index < 8; index += 1) {
    const sinLat = Math.sin(lat);
    const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(z + e2 * n * sinLat, p);
  }

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}

function lambert2ExtendedToWgs84(x: number, y: number) {
  const a = 6378249.2;
  const inverseFlattening = 293.466021293627;
  const f = 1 / inverseFlattening;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);
  const lat0 = (46.8 * Math.PI) / 180;
  const lon0 = 0;
  const k0 = 0.99987742;
  const falseEasting = 600000;
  const falseNorthing = 2200000;
  const parisMeridian = (2.33722917 * Math.PI) / 180;

  function m(lat: number) {
    const sinLat = Math.sin(lat);
    return Math.cos(lat) / Math.sqrt(1 - e2 * sinLat * sinLat);
  }

  function t(lat: number) {
    const sinLat = Math.sin(lat);
    return Math.tan(Math.PI / 4 - lat / 2) / Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2);
  }

  const n = Math.sin(lat0);
  const t0 = t(lat0);
  const f0 = m(lat0) / (n * Math.pow(t0, n));
  const rho0 = a * k0 * f0 * Math.pow(t0, n);
  const dx = x - falseEasting;
  const dy = rho0 - (y - falseNorthing);
  const rho = Math.sign(n) * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dx, dy);
  const targetT = Math.pow(rho / (a * k0 * f0), 1 / n);

  let lat = Math.PI / 2 - 2 * Math.atan(targetT);
  for (let index = 0; index < 8; index += 1) {
    const sinLat = Math.sin(lat);
    lat = Math.PI / 2 - 2 * Math.atan(targetT * Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2));
  }

  const lngParis = lon0 + theta / n;
  const ntf = geodeticToCartesian(lat, lngParis + parisMeridian, a, e2);
  return cartesianToWgs84(ntf.x - 168, ntf.y - 60, ntf.z + 320);
}

function convertToWgs84(x: number, y: number, projection: CoordinateProjection) {
  if (projection === "EPSG:4326") {
    return { lat: y, lng: x };
  }
  if (projection === "EPSG:2154") {
    return lambert93ToWgs84(x, y);
  }
  if (projection === "EPSG:27572") {
    return lambert2ExtendedToWgs84(x, y);
  }
  return webMercatorToWgs84(x, y);
}

function rowProperties(row: CsvRow) {
  return row.properties;
}

function parsePointRows(rows: CsvRow[]): { points: ImportedPoint[]; projection: CoordinateProjection; skippedRows: number; columns: string[]; labelColumn?: string } {
  const points: ImportedPoint[] = [];
  let skippedRows = 0;
  let firstProjection: CoordinateProjection | null = null;
  const columns = rows[0] ? Object.keys(rows[0].properties) : [];

  rows.forEach((row, index) => {
    const explicitProjection = projectionFromRow(row);
    const coordinateText = parseCoordinateText(pickValue(row, ["geo_point_2d", "geopoint", "coordinates", "coordonnees", "geom", "geometry", "wkt"]));
    const latValue = parseNumber(pickValue(row, ["lat", "latitude", "y_wgs84"]));
    const lngValue = parseNumber(pickValue(row, ["lng", "lon", "long", "longitude", "x_wgs84"]));
    const rawX = parseNumber(pickValue(row, ["x", "easting", "est", "x_l93", "x_lambert", "xouvrage", "xouvl2e", "xouvl2", "xl2e", "coordx", "coordonneex"]));
    const rawY = parseNumber(pickValue(row, ["y", "northing", "nord", "y_l93", "y_lambert", "youvrage", "youvl2e", "youvl2", "yl2e", "coordy", "coordonney"]));

    const hasLatLng = lngValue !== null && latValue !== null;
    const x = hasLatLng ? lngValue : coordinateText?.x ?? rawX;
    const y = hasLatLng ? latValue : coordinateText?.y ?? rawY;

    if (x === null || y === null) {
      skippedRows += 1;
      return;
    }

    const sourceProjection = hasLatLng || coordinateText ? (explicitProjection ?? "EPSG:4326") : detectProjection(x, y, explicitProjection);
    const targetLatLng = convertToWgs84(x, y, sourceProjection);
    if (
      !Number.isFinite(targetLatLng.lat) ||
      !Number.isFinite(targetLatLng.lng) ||
      Math.abs(targetLatLng.lat) > 90 ||
      Math.abs(targetLatLng.lng) > 180
    ) {
      skippedRows += 1;
      return;
    }

    firstProjection ??= sourceProjection;
    const name = pickValue(row, ["numcavite", "nomcavite", "name", "nom", "label", "libelle", "id", "numero"]) || `Point ${points.length + 1}`;
    points.push({
      id: `csv-point-${Date.now()}-${index}`,
      name,
      source: { x, y },
      sourceProjection,
      exportEnabled: true,
      targetLatLng: {
        lat: Number(targetLatLng.lat.toFixed(7)),
        lng: Number(targetLatLng.lng.toFixed(7)),
      },
      properties: rowProperties(row),
    });
  });

  return {
    points,
    projection: firstProjection ?? "EPSG:4326",
    skippedRows,
    columns,
    labelColumn: columns.find((column) => ["numcavite", "nomcavite", "nom", "name", "label", "libelle", "id", "numero"].includes(normalizeHeader(column))),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function webMercatorUnit(lat: number, lng: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  return {
    x: (lng + 180) / 360,
    y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2,
  };
}

function exportablePointLinks(payload: ExportPdfPayload, width: number, height: number) {
  const bounds = payload.area.bounds;
  const northWest = webMercatorUnit(bounds.north, bounds.west);
  const southEast = webMercatorUnit(bounds.south, bounds.east);
  const mercatorWidth = southEast.x - northWest.x;
  const mercatorHeight = southEast.y - northWest.y;

  if (mercatorWidth <= 0 || mercatorHeight <= 0) {
    return [];
  }

  const csvPointLinks = (payload.project.pointLayers ?? [])
    .filter((pointLayer) => pointLayer.visible)
    .flatMap((pointLayer) =>
      pointLayer.points
        .filter((point) => point.exportEnabled !== false)
        .filter(
          (point) =>
            point.targetLatLng.lat <= bounds.north &&
            point.targetLatLng.lat >= bounds.south &&
            point.targetLatLng.lng >= bounds.west &&
            point.targetLatLng.lng <= bounds.east,
        )
        .map((point) => {
          const projected = webMercatorUnit(point.targetLatLng.lat, point.targetLatLng.lng);
          return {
            name: point.name,
            href: googleMapsUrl(point.targetLatLng.lat, point.targetLatLng.lng),
            x: ((projected.x - northWest.x) / mercatorWidth) * width,
            y: ((projected.y - northWest.y) / mercatorHeight) * height,
          };
        }),
    );

  const infoPointLinks = (payload.project.infoPoints ?? [])
    .filter((point) => point.exportEnabled !== false)
    .filter(
      (point) =>
        point.targetLatLng.lat <= bounds.north &&
        point.targetLatLng.lat >= bounds.south &&
        point.targetLatLng.lng >= bounds.west &&
        point.targetLatLng.lng <= bounds.east,
    )
    .map((point) => {
      const projected = webMercatorUnit(point.targetLatLng.lat, point.targetLatLng.lng);
      return {
        name: point.name,
        href: googleMapsUrl(point.targetLatLng.lat, point.targetLatLng.lng),
        x: ((projected.x - northWest.x) / mercatorWidth) * width,
        y: ((projected.y - northWest.y) / mercatorHeight) * height,
      };
    });

  return [...csvPointLinks, ...infoPointLinks];
}

function mercatorBoundsSpan(bounds: ExportMapArea["bounds"]) {
  const northWest = webMercatorUnit(bounds.north, bounds.west);
  const southEast = webMercatorUnit(bounds.south, bounds.east);
  return {
    width: Math.max(0, southEast.x - northWest.x),
    height: Math.max(0, southEast.y - northWest.y),
  };
}

function streetDetailRenderSize(payload: ExportPdfPayload, captureRect: Rectangle) {
  const ratio = captureRect.width / captureRect.height;
  const span = mercatorBoundsSpan(payload.area.bounds);
  const targetZoom = Math.min(18, Math.max(16, Number(payload.baseMap?.maxZoom ?? 18)));
  const worldPixels = 256 * 2 ** targetZoom;
  const minDimension = 1400;
  const displayScaleFactor = Math.max(1, screen.getPrimaryDisplay().scaleFactor || 1);
  const maxTextureSafeDimension = Math.floor(15000 / displayScaleFactor);
  const maxDimension = Math.min(7200, maxTextureSafeDimension);
  const maxPixels = 24000000;

  let width = Math.round(span.width * worldPixels);
  let height = Math.round(span.height * worldPixels);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    width = Math.round(captureRect.width * 5);
    height = Math.round(captureRect.height * 5);
  }

  if (width / height > ratio) {
    height = Math.round(width / ratio);
  } else {
    width = Math.round(height * ratio);
  }

  if (width < minDimension && height < maxDimension) {
    width = minDimension;
    height = Math.round(width / ratio);
  }
  if (height < minDimension && width < maxDimension) {
    height = minDimension;
    width = Math.round(height * ratio);
  }

  if (width > maxDimension) {
    width = maxDimension;
    height = Math.round(width / ratio);
  }
  if (height > maxDimension) {
    height = maxDimension;
    width = Math.round(height * ratio);
  }
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    targetZoom,
    capped: width >= maxDimension || height >= maxDimension || width * height >= maxPixels,
  };
}

function sizeForMaxDimension(ratio: number, maxDimension: number) {
  if (ratio >= 1) {
    return {
      width: maxDimension,
      height: Math.max(1, Math.round(maxDimension / ratio)),
    };
  }

  return {
    width: Math.max(1, Math.round(maxDimension * ratio)),
    height: maxDimension,
  };
}

function fallbackRenderSizes(primary: { width: number; height: number }, captureRect: Rectangle) {
  const ratio = captureRect.width / captureRect.height;
  const candidates = [
    primary,
    sizeForMaxDimension(ratio, 5600),
    sizeForMaxDimension(ratio, 4200),
    sizeForMaxDimension(ratio, 3000),
    sizeForMaxDimension(ratio, 2000),
  ];
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const width = Math.max(1, Math.round(candidate.width));
    const height = Math.max(1, Math.round(candidate.height));
    const key = `${width}x${height}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function renderPdfHtml(payload: ExportPdfPayload, mapImageDataUrl: string) {
  const cssWidth = Math.max(1, Math.round(payload.area.captureRect.width));
  const cssHeight = Math.max(1, Math.round(payload.area.captureRect.height));
  const pointLinks = exportablePointLinks(payload, cssWidth, cssHeight);
  const linkDiameter = 22;
  const pointLinkHtml = pointLinks
    .map(
      (link) =>
        `<a class="pdf-point-link" href="${escapeHtml(link.href)}" title="${escapeHtml(`${link.name} - Google Maps`)}" style="left:${Math.round(
          link.x - linkDiameter / 2,
        )}px;top:${Math.round(link.y - linkDiameter / 2)}px;width:${linkDiameter}px;height:${linkDiameter}px;">${escapeHtml(link.name)}</a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Export PDF - ${escapeHtml(payload.project.name)}</title>
    <style>
      @page {
        size: ${cssWidth}px ${cssHeight}px;
        margin: 0;
      }

      html,
      body {
        width: ${cssWidth}px;
        height: ${cssHeight}px;
        margin: 0;
        overflow: hidden;
        background: #ffffff;
        position: relative;
      }

      img {
        width: ${cssWidth}px;
        height: ${cssHeight}px;
        display: block;
      }

      .pdf-point-link {
        position: absolute;
        z-index: 2;
        border-radius: 50%;
        color: transparent;
        background: rgba(255, 255, 255, 0);
        text-decoration: none;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <img src="${mapImageDataUrl}" alt="Zone selectionnee haute resolution" />
    ${pointLinkHtml}
  </body>
</html>`;
}

function renderPreviewHtml(payload: ExportPdfPayload, mapImageDataUrl: string) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Preview PDF - ${escapeHtml(payload.project.name)}</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #111827;
      }

      body {
        display: grid;
        place-items: center;
      }

      img {
        max-width: 100vw;
        max-height: 100vh;
        object-fit: contain;
        display: block;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <img src="${mapImageDataUrl}" alt="Apercu global de la zone selectionnee" />
  </body>
</html>`;
}

function normalizeCaptureRect(rect: Rectangle): Rectangle | null {
  const x = Math.max(0, Math.round(Number(rect.x)));
  const y = Math.max(0, Math.round(Number(rect.y)));
  const width = Math.round(Number(rect.width));
  const height = Math.round(Number(rect.height));

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width < 24 || height < 24) {
    return null;
  }

  return { x, y, width, height };
}

function leafletAssetUrl(relativePath: string) {
  return pathToFileURL(path.join(appRoot(), "node_modules", "leaflet", "dist", relativePath)).toString();
}

function renderMapHtml(payload: ExportPdfPayload, width: number, height: number) {
  const bounds = payload.area.bounds;
  const baseMap = payload.baseMap ?? {
    id: "osm",
    name: "OpenStreetMap",
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "",
    maxZoom: 20,
  };
  const baseMapOpacity = Math.min(1, Math.max(0.15, Number(payload.baseMapOpacity ?? 1)));
  const visibleLayers = payload.project.layers
    .filter((layer) => layer.visible && !(layer.overlayImageUrl && layer.overlayBounds) && layer.tileUrlTemplate)
    .map((layer, index) => ({
      name: layer.name,
      opacity: layer.opacity,
      tileUrlTemplate: layer.tileUrlTemplate,
      zIndex: 200 + index,
    }));
  const visibleImageLayers = payload.project.layers
    .filter((layer) => layer.visible && layer.overlayImageUrl && layer.overlayBounds)
    .map((layer, index) => ({
      name: layer.name,
      opacity: layer.opacity,
      imageUrl: layer.overlayImageUrl,
      bounds: layer.overlayBounds,
      zIndex: 200 + index,
    }));
  const visiblePointLayers = (payload.project.pointLayers ?? [])
    .filter((pointLayer) => pointLayer.visible)
    .map((pointLayer) => ({
      name: pointLayer.name,
      color: pointLayer.color,
      showLabels: pointLayer.showLabels,
      points: pointLayer.points
        .filter((point) => point.exportEnabled !== false)
        .map((point) => ({
          name: point.name,
          label: pointLayer.labelColumn ? point.properties[pointLayer.labelColumn] : point.name,
          lat: point.targetLatLng.lat,
          lng: point.targetLatLng.lng,
          googleMapsUrl: googleMapsUrl(point.targetLatLng.lat, point.targetLatLng.lng),
          sourceProjection: point.sourceProjection,
        })),
    }));
  const visibleInfoPoints = (payload.project.infoPoints ?? [])
    .filter((point) => point.exportEnabled !== false)
    .map((point) => ({
      name: point.name,
      comment: point.comment,
      lat: point.targetLatLng.lat,
      lng: point.targetLatLng.lng,
      googleMapsUrl: googleMapsUrl(point.targetLatLng.lat, point.targetLatLng.lng),
    }));

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${leafletAssetUrl("leaflet.css")}" />
    <style>
      html,
      body,
      #map {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        overflow: hidden;
        background: #ffffff;
      }

      .leaflet-control-container {
        display: none;
      }

      .basemap-dark-yellow {
        filter: sepia(1) saturate(5.2) hue-rotate(4deg) brightness(1.18) contrast(1.08);
      }

      .point-label {
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.92);
        color: #17202a;
        font-size: 11px;
        font-weight: 700;
      }

    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="${leafletAssetUrl("leaflet.js")}"></script>
    <script>
      const exportBounds = ${JSON.stringify(bounds)};
      const overlayLayers = ${JSON.stringify(visibleLayers)};
      const imageLayers = ${JSON.stringify(visibleImageLayers)};
      const pointLayers = ${JSON.stringify(visiblePointLayers)};
      const infoPoints = ${JSON.stringify(visibleInfoPoints)};
      const bounds = L.latLngBounds(
        [exportBounds.south, exportBounds.west],
        [exportBounds.north, exportBounds.east]
      );
      const map = L.map("map", {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        fadeAnimation: false,
        markerZoomAnimation: false,
        zoomAnimation: false
      });

      function waitForLayer(layer) {
        return new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) {
              return;
            }
            done = true;
            resolve();
          };
          layer.once("load", finish);
          layer.once("tileerror", finish);
          window.setTimeout(finish, 6000);
        });
      }

      const layers = [];
      const baseMap = ${JSON.stringify(baseMap)};
      const baseLayer = L.tileLayer(baseMap.urlTemplate, {
        maxZoom: baseMap.maxZoom || 20,
        opacity: ${baseMapOpacity},
        className: baseMap.className,
        crossOrigin: true
      }).addTo(map);
      layers.push(baseLayer);

      overlayLayers.forEach((overlay) => {
        const layer = L.tileLayer(overlay.tileUrlTemplate, {
          minZoom: 0,
          maxZoom: 22,
          tms: false,
          opacity: overlay.opacity,
          zIndex: overlay.zIndex
        }).addTo(map);
        layers.push(layer);
      });

      imageLayers.forEach((overlay) => {
        const overlayBounds = L.latLngBounds(
          [overlay.bounds.south, overlay.bounds.west],
          [overlay.bounds.north, overlay.bounds.east]
        );
        const layer = L.imageOverlay(overlay.imageUrl, overlayBounds, {
          opacity: overlay.opacity,
          zIndex: overlay.zIndex,
          crossOrigin: true
        }).addTo(map);
        layers.push(layer);
      });

      pointLayers.forEach((pointLayer) => {
        pointLayer.points.forEach((point) => {
          const marker = L.circleMarker([point.lat, point.lng], {
            radius: 4,
            color: "#dc2626",
            weight: 1.5,
            fillColor: "#ffffff",
            fillOpacity: 0.96
          }).addTo(map);
          if (pointLayer.showLabels && point.label) {
            marker.bindTooltip(point.label, {
              permanent: true,
              direction: "right",
              offset: [8, 0],
              className: "point-label"
            });
          }
        });
      });

      infoPoints.forEach((point) => {
        const marker = L.circleMarker([point.lat, point.lng], {
          radius: 4,
          color: "#16a34a",
          weight: 1.5,
          fillColor: "#ffffff",
          fillOpacity: 0.96
        }).addTo(map);
        marker.bindTooltip(point.name, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "point-label"
        });
      });

      map.fitBounds(bounds, { animate: false, padding: [0, 0] });
      map.invalidateSize(false);

      Promise.all(layers.map(waitForLayer)).then(() => {
        window.setTimeout(() => {
          window.__zgegMapReady = true;
        }, 250);
      });
    </script>
  </body>
</html>`;
}

async function renderMapAttempt(payload: ExportPdfPayload, tempDir: string, width: number, height: number, attemptIndex: number) {
  const mapHtmlPath = path.join(tempDir, `map-render-${attemptIndex}.html`);
  await fs.writeFile(mapHtmlPath, renderMapHtml(payload, width, height), "utf-8");
  let mapWindow: BrowserWindow | null = new BrowserWindow({
    width,
    height,
    show: false,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  try {
    const renderGone = new Promise<never>((_resolve, reject) => {
      mapWindow?.webContents.once("render-process-gone", (_event, details) => {
        reject(new Error(`rendu interrompu (${details.reason})`));
      });
    });
    await withTimeout(Promise.race([mapWindow.loadFile(mapHtmlPath), renderGone]), 15000, "chargement de la carte trop long");
    await withTimeout(
      Promise.race([
        mapWindow.webContents.executeJavaScript(
          "new Promise((resolve) => { const started = Date.now(); const timer = setInterval(() => { if (window.__zgegMapReady || Date.now() - started > 9000) { clearInterval(timer); resolve(true); } }, 100); })",
        ),
        renderGone,
      ]),
      16000,
      "chargement des tuiles trop long",
    );
    const image = await withTimeout(
      Promise.race([mapWindow.webContents.capturePage({ x: 0, y: 0, width, height }), renderGone]),
      12000,
      "capture de la carte trop lourde",
    );
    return image.toDataURL();
  } finally {
    if (!mapWindow.isDestroyed()) {
      mapWindow.close();
    }
    mapWindow = null;
  }
}

async function renderHighResolutionMap(payload: ExportPdfPayload, tempDir: string) {
  const captureRect = normalizeCaptureRect(payload.area.captureRect);
  if (!captureRect) {
    throw new Error("Zone d'export PDF invalide.");
  }

  const renderSize = streetDetailRenderSize(payload, captureRect);
  const attempts = fallbackRenderSizes(renderSize, captureRect);
  let lastError: Error | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      return await renderMapAttempt(payload, tempDir, attempt.width, attempt.height, index + 1);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("erreur inconnue");
    }
  }

  throw new Error(`rendu de carte impossible apres reduction automatique (${lastError?.message ?? "erreur inconnue"})`);
}

async function exportProjectPdf(event: IpcMainInvokeEvent, payload: ExportPdfPayload): Promise<JsonResult> {
  const projectName = sanitizeProjectName(payload.project?.name ?? "default-project");
  const projectDir = await ensureProjectDirs(projectName);
  const exportDir = path.join(projectDir, "exports");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = path.join(exportDir, `${projectName}-export-${timestamp}.pdf`);
  const captureRect = normalizeCaptureRect(payload.area.captureRect);

  if (!captureRect) {
    return { success: false, message: "Zone d'export PDF invalide." };
  }

  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!sourceWindow) {
    return { success: false, message: "Fenetre source introuvable pour l'export PDF." };
  }
  if (payload.area.mode !== "selection") {
    return { success: false, message: "Selectionnez une zone PDF avant d'exporter." };
  }

  const tempDir = await fs.mkdtemp(path.join(app.getPath("temp"), "zgeg-mapping-export-"));
  const previewHtmlPath = path.join(tempDir, "preview.html");
  const pdfHtmlPath = path.join(tempDir, "export.html");
  let previewWindow: BrowserWindow | null = null;
  let pdfWindow: BrowserWindow | null = null;

  try {
    const mapImageDataUrl = await renderHighResolutionMap(payload, tempDir);
    await fs.writeFile(previewHtmlPath, renderPreviewHtml(payload, mapImageDataUrl), "utf-8");
    await fs.writeFile(pdfHtmlPath, renderPdfHtml(payload, mapImageDataUrl), "utf-8");

    previewWindow = new BrowserWindow({
      width: 1000,
      height: 760,
      show: true,
      title: "Preview PDF - ZgegMapping",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false,
      },
    });

    previewWindow.on("closed", () => {
      void fs.rm(tempDir, { recursive: true, force: true });
    });
    await previewWindow.loadFile(previewHtmlPath);

    const { canceled, filePath } = await dialog.showSaveDialog(previewWindow, {
      title: "Exporter la carte en PDF",
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: "Preview ouverte. Export PDF annule." };
    }

    pdfWindow = new BrowserWindow({
      width: captureRect.width,
      height: captureRect.height,
      show: false,
      useContentSize: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false,
      },
    });
    await pdfWindow.loadFile(pdfHtmlPath);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    await fs.writeFile(filePath, pdf);
    return { success: true, message: "Preview ouverte et PDF exporte avec succes.", outputPath: filePath };
  } catch (error) {
    const err = error as { message?: string };
    if (previewWindow === null || previewWindow.isDestroyed()) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    return { success: false, message: `Echec de l'export PDF : ${err.message ?? "erreur inconnue"}.` };
  } finally {
    pdfWindow?.close();
  }
}

function pythonCommand() {
  return process.platform === "win32" ? "python" : "python3";
}

function parseJson(stdout: string, fallbackMessage: string): JsonResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { success: false, message: fallbackMessage };
  }

  const lastLine = trimmed.split(/\r?\n/).at(-1) ?? trimmed;
  try {
    return JSON.parse(lastLine) as JsonResult;
  } catch {
    try {
      return JSON.parse(trimmed) as JsonResult;
    } catch {
      return { success: false, message: `${fallbackMessage}\n${trimmed}` };
    }
  }
}

async function runPython(scriptName: string, args: string[]): Promise<JsonResult> {
  const scriptPath = path.join(backendRoot(), scriptName);
  try {
    const { stdout, stderr } = await execFileAsync(pythonCommand(), [scriptPath, ...args], {
      cwd: appRoot(),
      maxBuffer: 1024 * 1024 * 20,
      windowsHide: true,
    });
    const result = parseJson(stdout, stderr || `Le script ${scriptName} n'a pas retourne de JSON.`);
    return result;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const parsed = parseJson(err.stdout ?? "", err.stderr ?? err.message ?? `Echec du script ${scriptName}.`);
    return parsed.success === false ? parsed : { ...parsed, success: false };
  }
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "ZgegMapping",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(appRoot(), "dist", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

ipcMain.handle("project:import-map", async (_event, projectName: string): Promise<JsonResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Importer une carte",
    properties: ["openFile"],
    filters: [
      { name: "Cartes image ou PDF", extensions: ["jpg", "jpeg", "png", "tif", "tiff", "pdf"] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: "Import annule." };
  }

  const sourcePath = filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!imageExtensions.has(extension) && !pdfExtensions.has(extension)) {
    return { success: false, message: "Format non pris en charge." };
  }

  const projectDir = await ensureProjectDirs(projectName);
  const layerId = `layer-${Date.now()}`;
  const originalName = `${layerId}-${sanitizeFileName(path.basename(sourcePath))}`;
  const originalPath = path.join(projectDir, "originals", originalName);
  await fs.copyFile(sourcePath, originalPath);

  let convertedImagePath: string | undefined;
  if (pdfExtensions.has(extension)) {
    convertedImagePath = path.join(projectDir, "converted", `${layerId}.png`);
    const conversion = await runPython("convert_pdf.py", [
      "--input",
      originalPath,
      "--output",
      convertedImagePath,
      "--logs",
      path.join(projectDir, "logs"),
    ]);

    if (!conversion.success) {
      return {
        ...conversion,
        success: false,
        originalFilePath: originalPath,
        message: "Conversion PDF indisponible : installer poppler ou utiliser une image PNG/JPEG.",
      };
    }
  }

  return {
    success: true,
    message: "Carte importee.",
    layer: {
      id: layerId,
      name: path.basename(sourcePath, extension),
      originalFilePath: originalPath,
      convertedImagePath,
      backgroundRemoval: {
        enabled: false,
        color: "#000000",
        tolerance: 16,
      },
      opacity: 0.65,
      visible: true,
      controlPoints: [],
    },
  };
});

ipcMain.handle("points:import-csv", async (_event, projectName: string): Promise<JsonResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Importer un CSV de points",
    properties: ["openFile"],
    filters: [{ name: "CSV de points", extensions: ["csv", "txt"] }],
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: "Import CSV annule." };
  }

  const sourcePath = filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!csvExtensions.has(extension)) {
    return { success: false, message: "Format CSV non pris en charge." };
  }

  const projectDir = await ensureProjectDirs(projectName);
  const pointLayerId = `points-${Date.now()}`;
  const originalName = `${pointLayerId}-${sanitizeFileName(path.basename(sourcePath))}`;
  const originalPath = path.join(projectDir, "points", originalName);
  await fs.copyFile(sourcePath, originalPath);

  const content = await fs.readFile(originalPath, "utf-8");
  const rows = parseCsv(content);
  const parsed = parsePointRows(rows);
  if (parsed.points.length === 0) {
    return {
      success: false,
      message:
        "Aucun point valide trouve. Colonnes acceptees : lat/lng, x/y, xOuvrage/yOuvrage ou xouvl2e/youvl2e avec projection EPSG:4326, EPSG:3857, EPSG:2154 ou EPSG:27572.",
      originalFilePath: originalPath,
      skippedRows: parsed.skippedRows,
    };
  }

  return {
    success: true,
    message: `${parsed.points.length} point(s) importes en ${parsed.projection}.`,
    originalFilePath: originalPath,
    skippedRows: parsed.skippedRows,
    pointLayer: {
      id: pointLayerId,
      name: path.basename(sourcePath, extension),
      originalFilePath: originalPath,
      sourceProjection: parsed.projection,
      visible: true,
      color: "#14b8a6",
      columns: parsed.columns,
      showLabels: false,
      labelColumn: parsed.labelColumn,
      points: parsed.points,
    },
  };
});

ipcMain.handle("project:save", async (_event, project: { name?: string }): Promise<JsonResult> => {
  const projectName = sanitizeProjectName(project.name ?? "default-project");
  const projectDir = await ensureProjectDirs(projectName);
  const projectPath = path.join(projectDir, "project.json");
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf-8");
  return { success: true, message: "Projet sauvegarde.", projectPath };
});

ipcMain.handle("project:open", async (): Promise<JsonResult> => {
  await fs.mkdir(projectsRoot(), { recursive: true });
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Ouvrir un projet ZgegMapping",
    defaultPath: projectsRoot(),
    properties: ["openFile"],
    filters: [{ name: "Projet ZgegMapping", extensions: ["json"] }],
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, message: "Ouverture annulee." };
  }

  const rawProject = await fs.readFile(filePaths[0], "utf-8");
  return { success: true, message: "Projet ouvert.", project: JSON.parse(rawProject), projectPath: filePaths[0] };
});

ipcMain.handle(
  "layer:georeference",
  async (
    _event,
    payload: {
      projectName: string;
      layer: { id: string; originalFilePath: string; convertedImagePath?: string; processedImagePath?: string; controlPoints: unknown[] };
    },
  ): Promise<JsonResult> => {
    const projectDir = await ensureProjectDirs(payload.projectName);
    const sourcePath = payload.layer.processedImagePath || payload.layer.convertedImagePath || payload.layer.originalFilePath;
    const pointsPath = path.join(projectDir, "control_points", `${payload.layer.id}.json`);
    const outputPath = path.join(projectDir, "georeferenced", `${payload.layer.id}.tif`);

    await fs.writeFile(pointsPath, JSON.stringify(payload.layer.controlPoints, null, 2), "utf-8");

    return runPython("georeference.py", [
      "--source",
      sourcePath,
      "--output",
      outputPath,
      "--points",
      pointsPath,
      "--epsg",
      "EPSG:3857",
      "--logs",
      path.join(projectDir, "logs"),
    ]);
  },
);

ipcMain.handle(
  "layer:remove-background",
  async (
    _event,
    payload: {
      projectName: string;
      layer: { id: string; originalFilePath: string; convertedImagePath?: string };
      color: string;
      tolerance: number;
    },
  ): Promise<JsonResult> => {
    const projectDir = await ensureProjectDirs(payload.projectName);
    const sourcePath = payload.layer.convertedImagePath || payload.layer.originalFilePath;
    const outputPath = path.join(projectDir, "converted", `${payload.layer.id}-transparent.png`);
    return runPython("remove_background.py", [
      "--input",
      sourcePath,
      "--output",
      outputPath,
      "--color",
      payload.color,
      "--tolerance",
      String(payload.tolerance),
      "--logs",
      path.join(projectDir, "logs"),
    ]);
  },
);

ipcMain.handle(
  "layer:generate-tiles",
  async (_event, payload: { projectName: string; layer: { id: string; georefFilePath?: string } }): Promise<JsonResult> => {
    if (!payload.layer.georefFilePath) {
      return { success: false, message: "Aucun GeoTIFF disponible pour cette couche." };
    }

    const projectDir = await ensureProjectDirs(payload.projectName);
    const tilesDir = path.join(projectDir, "tiles", payload.layer.id);
    return runPython("generate_tiles.py", [
      "--source",
      payload.layer.georefFilePath,
      "--output",
      tilesDir,
      "--logs",
      path.join(projectDir, "logs"),
    ]);
  },
);

ipcMain.handle(
  "layer:generate-overlay",
  async (_event, payload: { projectName: string; layer: { id: string; georefFilePath?: string } }): Promise<JsonResult> => {
    if (!payload.layer.georefFilePath) {
      return { success: false, message: "Aucun GeoTIFF disponible pour cette couche." };
    }

    const projectDir = await ensureProjectDirs(payload.projectName);
    const overlayPath = path.join(projectDir, "overlays", `${payload.layer.id}.png`);
    return runPython("generate_overlay.py", [
      "--source",
      payload.layer.georefFilePath,
      "--output",
      overlayPath,
      "--logs",
      path.join(projectDir, "logs"),
    ]);
  },
);

ipcMain.handle("project:export-pdf", exportProjectPdf);

ipcMain.handle("tools:check-dependencies", async (): Promise<JsonResult> => {
  return runPython("check_dependencies.py", []);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
