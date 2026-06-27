import type { CoordinateProjection } from "../types/project";

const WEB_MERCATOR_LIMIT = 20037508.342789244;

export const COORDINATE_PROJECTIONS: Array<{ id: CoordinateProjection; label: string }> = [
  { id: "EPSG:4326", label: "WGS84 lat/lng" },
  { id: "EPSG:3857", label: "Web Mercator" },
  { id: "EPSG:2154", label: "Lambert 93" },
];

function webMercatorToWgs84(x: number, y: number) {
  const lng = (x / WEB_MERCATOR_LIMIT) * 180;
  const mercatorLat = (y / WEB_MERCATOR_LIMIT) * 180;
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

export function convertToWgs84(x: number, y: number, projection: CoordinateProjection) {
  if (projection === "EPSG:4326") {
    return { lat: y, lng: x };
  }
  if (projection === "EPSG:2154") {
    return lambert93ToWgs84(x, y);
  }
  return webMercatorToWgs84(x, y);
}

export function roundedLatLng(x: number, y: number, projection: CoordinateProjection) {
  const converted = convertToWgs84(x, y, projection);
  return {
    lat: Number(converted.lat.toFixed(7)),
    lng: Number(converted.lng.toFixed(7)),
  };
}
