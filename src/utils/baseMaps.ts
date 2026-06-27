import type { BaseMapConfig } from "../types/project";

export const DEFAULT_BASE_MAP_ID = "cartoVoyager";

export const BASE_MAPS: BaseMapConfig[] = [
  {
    id: "cartoVoyager",
    name: "CARTO Voyager",
    urlTemplate: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: "cartoLight",
    name: "CARTO Clair",
    urlTemplate: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: "darkYellow",
    name: "Sombre rues jaunes",
    urlTemplate: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    className: "basemap-dark-yellow",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
  },
];

export function getBaseMap(id: string | null | undefined) {
  return BASE_MAPS.find((baseMap) => baseMap.id === id) ?? BASE_MAPS.find((baseMap) => baseMap.id === DEFAULT_BASE_MAP_ID) ?? BASE_MAPS[0];
}
