import type { ControlPoint, MapLayer } from "../types/project";

export function filePathToUrl(filePath?: string) {
  if (!filePath) {
    return "";
  }

  const normalized = filePath.replace(/\\/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeadingSlash}`);
}

export function layerDisplayImage(layer?: MapLayer) {
  return layer?.processedImagePath || layer?.convertedImagePath || layer?.originalFilePath || "";
}

export function controlPointBounds(points: ControlPoint[]) {
  const valid = points.filter((point) => Number.isFinite(point.targetLatLng.lat) && Number.isFinite(point.targetLatLng.lng));
  if (valid.length === 0) {
    return null;
  }

  return valid.map((point) => [point.targetLatLng.lat, point.targetLatLng.lng] as [number, number]);
}
