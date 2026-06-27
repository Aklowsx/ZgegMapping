import { contextBridge, ipcRenderer } from "electron";

const api = {
  importMap: (projectName: string) => ipcRenderer.invoke("project:import-map", projectName),
  importPointCsv: (projectName: string) => ipcRenderer.invoke("points:import-csv", projectName),
  saveProject: (project: unknown) => ipcRenderer.invoke("project:save", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  georeferenceLayer: (payload: unknown) => ipcRenderer.invoke("layer:georeference", payload),
  generateOverlay: (payload: unknown) => ipcRenderer.invoke("layer:generate-overlay", payload),
  generateTiles: (payload: unknown) => ipcRenderer.invoke("layer:generate-tiles", payload),
  exportPdf: (payload: unknown) => ipcRenderer.invoke("project:export-pdf", payload),
  checkDependencies: () => ipcRenderer.invoke("tools:check-dependencies"),
};

contextBridge.exposeInMainWorld("zgegMapping", api);
