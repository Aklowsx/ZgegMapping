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

type ExportPdfPayload = {
  project: PdfProject;
  selectedLayerId: string | null;
  area: ExportMapArea;
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Non renseigne";
  }

  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(7) : "Non renseigne";
}

function layerStatus(layer: PdfLayer) {
  const flags = [
    layer.visible ? "visible" : "masquee",
    layer.georefFilePath ? "GeoTIFF" : "non georef.",
    layer.tileUrlTemplate ? "tuiles" : "sans tuiles",
  ];
  return flags.join(" / ");
}

function renderPdfHtml(payload: ExportPdfPayload, mapImageDataUrl: string) {
  const { project, selectedLayerId, area } = payload;
  const generatedAt = new Date();
  const selectedLayer = project.layers.find((layer) => layer.id === selectedLayerId);
  const visibleLayers = project.layers.filter((layer) => layer.visible);
  const layersRows = project.layers
    .map(
      (layer, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(layer.name)}</td>
          <td>${escapeHtml(layerStatus(layer))}</td>
          <td>${Math.round(Number(layer.opacity ?? 0) * 100)}%</td>
          <td>${layer.controlPoints.length}</td>
          <td>${escapeHtml(layer.georefFilePath || "-")}</td>
          <td>${escapeHtml(layer.tilesPath || "-")}</td>
        </tr>
      `,
    )
    .join("");

  const pointsRows = project.layers
    .flatMap((layer) =>
      layer.controlPoints.map(
        (point) => `
          <tr>
            <td>${escapeHtml(layer.name)}</td>
            <td>${escapeHtml(point.name)}</td>
            <td>${Number(point.sourcePixel.x).toFixed(0)}</td>
            <td>${Number(point.sourcePixel.y).toFixed(0)}</td>
            <td>${formatNumber(point.targetLatLng.lat)}</td>
            <td>${formatNumber(point.targetLatLng.lng)}</td>
          </tr>
        `,
      ),
    )
    .join("");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Export PDF - ${escapeHtml(payload.project.name)}</title>
    <style>
      @page {
        size: A4;
        margin: 13mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #17202a;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.42;
        background: #ffffff;
      }

      h1,
      h2,
      p {
        margin-top: 0;
      }

      h1 {
        margin-bottom: 5px;
        font-size: 24px;
        color: #102033;
      }

      h2 {
        margin: 20px 0 9px;
        padding-bottom: 5px;
        border-bottom: 1px solid #c9d1dc;
        font-size: 15px;
        color: #102033;
      }

      .subtitle,
      .note {
        color: #526174;
        font-size: 12px;
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin: 16px 0;
      }

      .summary div {
        min-height: 58px;
        padding: 8px;
        border: 1px solid #d7dde6;
        border-radius: 6px;
        background: #f8fafc;
      }

      .label {
        display: block;
        margin-bottom: 3px;
        color: #617083;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .value {
        overflow-wrap: anywhere;
        color: #17202a;
        font-weight: 700;
      }

      .map-frame {
        padding: 7px;
        border: 1px solid #c9d1dc;
        border-radius: 6px;
        background: #ffffff;
      }

      .map-frame img {
        width: 100%;
        max-height: 430px;
        object-fit: contain;
        display: block;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: auto;
      }

      th,
      td {
        padding: 5px 6px;
        border: 1px solid #d7dde6;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      th {
        background: #eef2f6;
        color: #405066;
        font-size: 9px;
        text-align: left;
        text-transform: uppercase;
      }

      tr {
        page-break-inside: avoid;
      }

      .footer {
        margin-top: 24px;
        padding-top: 8px;
        border-top: 1px solid #d7dde6;
        color: #617083;
        font-size: 9px;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(project.name)}</h1>
    <p class="subtitle">Export PDF detaille genere le ${escapeHtml(formatDate(generatedAt.toISOString()))}</p>

    <section class="summary">
      <div>
        <span class="label">Mode d'export</span>
        <span class="value">Zone selectionnee</span>
      </div>
      <div>
        <span class="label">Couche active</span>
        <span class="value">${escapeHtml(selectedLayer?.name || "Aucune")}</span>
      </div>
      <div>
        <span class="label">Couches visibles</span>
        <span class="value">${visibleLayers.length} / ${project.layers.length}</span>
      </div>
      <div>
        <span class="label">Zoom source</span>
        <span class="value">${area.zoom}</span>
      </div>
    </section>

    <h2>Carte exportee</h2>
    <div class="map-frame">
      <img src="${mapImageDataUrl}" alt="Carte exportee haute resolution" />
    </div>
    <p class="note">Cette image est rendue en haute resolution a partir de l'emprise selectionnee, puis integree au PDF.</p>

    <h2>Emprise geographique</h2>
    <table>
      <thead>
        <tr>
          <th>Nord</th>
          <th>Sud</th>
          <th>Ouest</th>
          <th>Est</th>
          <th>Centre lat.</th>
          <th>Centre lng.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${formatNumber(area.bounds.north)}</td>
          <td>${formatNumber(area.bounds.south)}</td>
          <td>${formatNumber(area.bounds.west)}</td>
          <td>${formatNumber(area.bounds.east)}</td>
          <td>${formatNumber(area.center.lat)}</td>
          <td>${formatNumber(area.center.lng)}</td>
        </tr>
      </tbody>
    </table>

    <h2>Couches du projet</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 34px;">Ordre</th>
          <th>Nom</th>
          <th>Etat</th>
          <th style="width: 58px;">Opacite</th>
          <th style="width: 58px;">Points</th>
          <th>GeoTIFF</th>
          <th>Tuiles</th>
        </tr>
      </thead>
      <tbody>
        ${layersRows || '<tr><td colspan="7">Aucune couche dans le projet.</td></tr>'}
      </tbody>
    </table>

    <h2>Points de controle</h2>
    <table>
      <thead>
        <tr>
          <th>Couche</th>
          <th>Point</th>
          <th>Pixel X</th>
          <th>Pixel Y</th>
          <th>Latitude</th>
          <th>Longitude</th>
        </tr>
      </thead>
      <tbody>
        ${pointsRows || '<tr><td colspan="6">Aucun point de controle dans le projet.</td></tr>'}
      </tbody>
    </table>

    <h2>Informations projet</h2>
    <table>
      <tbody>
        <tr><th>Identifiant</th><td>${escapeHtml(project.id)}</td></tr>
        <tr><th>Cree le</th><td>${escapeHtml(formatDate(project.createdAt))}</td></tr>
        <tr><th>Modifie le</th><td>${escapeHtml(formatDate(project.updatedAt))}</td></tr>
      </tbody>
    </table>

    <p class="footer">Document genere localement par ZgegMapping. Les fonds OpenStreetMap restent soumis a leurs conditions d'utilisation et d'attribution.</p>
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
      const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
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

  width = Math.max(600, width);
  height = Math.max(400, height);

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
  const htmlPath = path.join(tempDir, "export.html");
  let previewWindow: BrowserWindow | null = null;

  try {
    const mapImageDataUrl = await renderHighResolutionMap(payload, tempDir);
    const html = renderPdfHtml(payload, mapImageDataUrl);
    await fs.writeFile(htmlPath, html, "utf-8");

    previewWindow = new BrowserWindow({
      width: 1000,
      height: 1300,
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
    await previewWindow.loadFile(htmlPath);

    const { canceled, filePath } = await dialog.showSaveDialog(previewWindow, {
      title: "Exporter la carte en PDF",
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: "Preview ouverte. Export PDF annule." };
    }

    const pdf = await previewWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
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
