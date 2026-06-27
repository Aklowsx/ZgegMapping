export type ControlPoint = {
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

export type InfoPoint = {
  id: string;
  name: string;
  comment?: string;
  exportEnabled?: boolean;
  targetLatLng: {
    lat: number;
    lng: number;
  };
};

export type CoordinateProjection = "EPSG:4326" | "EPSG:3857" | "EPSG:2154" | "EPSG:27572";

export type BackgroundRemovalSettings = {
  enabled: boolean;
  color: string;
  tolerance: number;
  processedImagePath?: string;
};

export type ImportedPoint = {
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

export type PointLayer = {
  id: string;
  name: string;
  originalFilePath: string;
  sourceProjection: CoordinateProjection;
  visible: boolean;
  color: string;
  columns: string[];
  showLabels: boolean;
  labelColumn?: string;
  points: ImportedPoint[];
};

export type MapLayer = {
  id: string;
  name: string;
  originalFilePath: string;
  convertedImagePath?: string;
  processedImagePath?: string;
  backgroundRemoval?: BackgroundRemovalSettings;
  georefFilePath?: string;
  overlayImagePath?: string;
  overlayImageUrl?: string;
  overlayBounds?: MapBounds;
  tilesPath?: string;
  tileUrlTemplate?: string;
  opacity: number;
  visible: boolean;
  controlPoints: ControlPoint[];
};

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: MapLayer[];
  pointLayers: PointLayer[];
  infoPoints?: InfoPoint[];
};

export type BaseMapConfig = {
  id: string;
  name: string;
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  className?: string;
};

export type ExportMapArea = {
  mode: "selection" | "viewport";
  bounds: MapBounds;
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  captureRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type OperationResult<T = Record<string, unknown>> = {
  success: boolean;
  message: string;
} & T;
