import type { BaseMapConfig, ExportMapArea, MapLayer, MapProject, OperationResult } from "../types/project";

type ImportResult = OperationResult<{ layer?: MapLayer; originalFilePath?: string }>;
type SaveResult = OperationResult<{ projectPath?: string }>;
type OpenResult = OperationResult<{ project?: MapProject; projectPath?: string }>;
type GeorefResult = OperationResult<{ output?: string }>;
type TilesResult = OperationResult<{ tilesPath?: string; urlTemplate?: string }>;
type DependencyResult = OperationResult<{ dependencies?: Record<string, boolean> }>;
type ExportPdfResult = OperationResult<{ outputPath?: string }>;

declare global {
  interface Window {
    zgegMapping: {
      importMap(projectName: string): Promise<ImportResult>;
      saveProject(project: MapProject): Promise<SaveResult>;
      openProject(): Promise<OpenResult>;
      georeferenceLayer(payload: { projectName: string; layer: MapLayer }): Promise<GeorefResult>;
      generateTiles(payload: { projectName: string; layer: MapLayer }): Promise<TilesResult>;
      exportPdf(payload: {
        project: MapProject;
        selectedLayerId: string | null;
        area: ExportMapArea;
        baseMap: BaseMapConfig;
        baseMapOpacity: number;
      }): Promise<ExportPdfResult>;
      checkDependencies(): Promise<DependencyResult>;
    };
  }
}

export const ipcClient = window.zgegMapping;
