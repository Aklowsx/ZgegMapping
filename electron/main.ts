import { app, BrowserWindow, dialog, ipcMain } from "electron";
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
  sourcePixel: {
    x: number;
    y: number;
  };
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
  georefFilePath?: string;
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
  const dirs = ["originals", "converted", "georeferenced", "tiles", "logs", "control_points", "exports"];
  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(root, dir), { recursive: true })));
  return root;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPdfHtml(payload: ExportPdfPayload, mapImageDataUrl: string) {
  const cssWidth = Math.max(1, Math.round(payload.area.captureRect.width));
  const cssHeight = Math.max(1, Math.round(payload.area.captureRect.height));

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
      }

      img {
        width: ${cssWidth}px;
        height: ${cssHeight}px;
        display: block;
      }
    </style>
  </head>
  <body>
    <img src="${mapImageDataUrl}" alt="Zone selectionnee haute resolution" />
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
    .filter((layer) => layer.visible && layer.tileUrlTemplate)
    .map((layer, index) => ({
      name: layer.name,
      opacity: layer.opacity,
      tileUrlTemplate: layer.tileUrlTemplate,
      zIndex: 200 + index,
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
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="${leafletAssetUrl("leaflet.js")}"></script>
    <script>
      const exportBounds = ${JSON.stringify(bounds)};
      const overlayLayers = ${JSON.stringify(visibleLayers)};
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

async function renderHighResolutionMap(payload: ExportPdfPayload, tempDir: string) {
  const captureRect = normalizeCaptureRect(payload.area.captureRect);
  if (!captureRect) {
    throw new Error("Zone d'export PDF invalide.");
  }

  const scale = 3;
  const maxDimension = 3200;
  const minDimension = 600;
  const ratio = captureRect.width / captureRect.height;
  let width = Math.round(captureRect.width * scale);
  let height = Math.round(captureRect.height * scale);

  if (width > maxDimension) {
    width = maxDimension;
    height = Math.round(width / ratio);
  }
  if (height > maxDimension) {
    height = maxDimension;
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

  const mapHtmlPath = path.join(tempDir, "map-render.html");
  await fs.writeFile(mapHtmlPath, renderMapHtml(payload, width, height), "utf-8");

  let mapWindow: BrowserWindow | null = new BrowserWindow({
    width,
    height,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  try {
    await mapWindow.loadFile(mapHtmlPath);
    await mapWindow.webContents.executeJavaScript(
      "new Promise((resolve) => { const started = Date.now(); const timer = setInterval(() => { if (window.__zgegMapReady || Date.now() - started > 9000) { clearInterval(timer); resolve(true); } }, 100); })",
    );
    const image = await mapWindow.webContents.capturePage({ x: 0, y: 0, width, height });
    return image.toDataURL();
  } finally {
    mapWindow.close();
    mapWindow = null;
  }
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
      opacity: 0.65,
      visible: true,
      controlPoints: [],
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
  async (_event, payload: { projectName: string; layer: { id: string; originalFilePath: string; convertedImagePath?: string; controlPoints: unknown[] } }): Promise<JsonResult> => {
    const projectDir = await ensureProjectDirs(payload.projectName);
    const sourcePath = payload.layer.convertedImagePath || payload.layer.originalFilePath;
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
