import type { MapProject } from "../types/project";

export function createEmptyProject(): MapProject {
  const now = new Date().toISOString();
  return {
    id: `project-${Date.now()}`,
    name: "Mon projet",
    createdAt: now,
    updatedAt: now,
    layers: [],
    pointLayers: [],
  };
}

export function touchProject(project: MapProject): MapProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}
