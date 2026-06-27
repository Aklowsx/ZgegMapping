export type ControlPoint = {
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

export type MapLayer = {
  id: string;
  name: string;
  originalFilePath: string;
  convertedImagePath?: string;
  georefFilePath?: string;
  tilesPath?: string;
  tileUrlTemplate?: string;
  opacity: number;
  visible: boolean;
  controlPoints: ControlPoint[];
};

export type MapProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: MapLayer[];
};

export type ExportMapArea = {
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
