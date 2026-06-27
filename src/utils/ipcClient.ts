import type { BaseMapConfig, ExportMapArea, MapLayer, MapProject, OperationResult, PointLayer } from "../types/project";

type ImportResult = OperationResult<{ layer?: MapLayer; originalFilePath?: string }>;
type PointImportResult = OperationResult<{ pointLayer?: PointLayer; originalFilePath?: string; skippedRows?: number }>;
type SaveResult = OperationResult<{ projectPath?: string }>;
type OpenResult = OperationResult<{ project?: MapProject; projectPath?: string }>;
type GeorefResult = OperationResult<{ output?: string }>;
type OverlayResult = OperationResult<{ imagePath?: string; imageUrl?: string; bounds?: MapLayer["overlayBounds"] }>;
type TilesResult = OperationResult<{ tilesPath?: string; urlTemplate?: string }>;
type DependencyResult = OperationResult<{ dependencies?: Record<string, boolean> }>;
type ExportPdfResult = OperationResult<{ outputPath?: string }>;

declare global {
  interface Window {
    zgegMapping: {
      importMap(projectName: string): Promise<ImportResult>;
      importPointCsv(projectName: string): Promise<PointImportResult>;
      saveProject(project: MapProject): Promise<SaveResult>;
      openProject(): Promise<OpenResult>;
      georeferenceLayer(payload: { projectName: string; layer: MapLayer }): Promise<GeorefResult>;
      removeLayerBackground(payload: {
        projectName: string;
        layer: MapLayer;
        color: string;
        tolerance: number;
      }): Promise<OperationResult<{ output?: string; removedPixels?: number }>>;
      generateOverlay(payload: { projectName: string; layer: MapLayer }): Promise<OverlayResult>;
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
