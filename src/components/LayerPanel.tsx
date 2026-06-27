import { Eye, EyeOff, LocateFixed, MoveDown, MoveUp, Trash2 } from "lucide-react";
import type { MapLayer } from "../types/project";

type LayerPanelProps = {
  layers: MapLayer[];
  selectedLayerId: string | null;
  onSelectLayer(layerId: string): void;
  onLayersChange(layers: MapLayer[]): void;
  onFocusLayer(layerId: string): void;
};

export function LayerPanel({ layers, selectedLayerId, onSelectLayer, onLayersChange, onFocusLayer }: LayerPanelProps) {
  function updateLayer(layerId: string, updater: (layer: MapLayer) => MapLayer) {
    onLayersChange(layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)));
  }

  function moveLayer(layerId: string, direction: -1 | 1) {
    const index = layers.findIndex((layer) => layer.id === layerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) {
      return;
    }

    const nextLayers = [...layers];
    const [layer] = nextLayers.splice(index, 1);
    nextLayers.splice(nextIndex, 0, layer);
    onLayersChange(nextLayers);
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Couches</h2>
        <span>{layers.length}</span>
      </div>

      {layers.length === 0 ? (
        <p className="muted">Aucune couche importee.</p>
      ) : (
        <div className="layer-list">
          {layers.map((layer, index) => (
            <article className={`layer-item ${layer.id === selectedLayerId ? "selected" : ""}`} key={layer.id}>
              <button type="button" className="layer-select" onClick={() => onSelectLayer(layer.id)}>
                {layer.name}
              </button>
              <input
                className="layer-name-input"
                value={layer.name}
                onChange={(event) => updateLayer(layer.id, (current) => ({ ...current, name: event.target.value }))}
                aria-label="Renommer la couche"
              />
              <div className="layer-controls">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => updateLayer(layer.id, (current) => ({ ...current, visible: !current.visible }))}
                  title={layer.visible ? "Masquer" : "Afficher"}
                >
                  {layer.visible ? <Eye size={16} aria-label="Masquer" /> : <EyeOff size={16} aria-label="Afficher" />}
                </button>
                <button type="button" className="icon-button" onClick={() => moveLayer(layer.id, -1)} disabled={index === 0} title="Monter">
                  <MoveUp size={16} aria-label="Monter" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => moveLayer(layer.id, 1)}
                  disabled={index === layers.length - 1}
                  title="Descendre"
                >
                  <MoveDown size={16} aria-label="Descendre" />
                </button>
                <button type="button" className="icon-button" onClick={() => onFocusLayer(layer.id)} title="Centrer">
                  <LocateFixed size={16} aria-label="Centrer" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => onLayersChange(layers.filter((current) => current.id !== layer.id))}
                  title="Supprimer"
                >
                  <Trash2 size={16} aria-label="Supprimer" />
                </button>
              </div>
              <label className="opacity-row">
                <span>Opacite</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={layer.opacity}
                  onChange={(event) => updateLayer(layer.id, (current) => ({ ...current, opacity: Number(event.target.value) }))}
                />
                <strong>{Math.round(layer.opacity * 100)}%</strong>
              </label>
              <div className="layer-meta">
                <span>{layer.controlPoints.length} pts</span>
                <span>{layer.georefFilePath ? "GeoTIFF" : "Non georef."}</span>
                <span>{layer.overlayImageUrl ? "Apercu rapide" : "Sans apercu"}</span>
                <span>{layer.tileUrlTemplate ? "Tuiles" : "Sans tuiles"}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
