import { Eye, EyeOff, LocateFixed, Trash2 } from "lucide-react";
import type { PointLayer } from "../types/project";

type PointLayerPanelProps = {
  pointLayers: PointLayer[];
  onPointLayersChange(pointLayers: PointLayer[]): void;
  onFocusPointLayer(pointLayerId: string): void;
};

export function PointLayerPanel({ pointLayers, onPointLayersChange, onFocusPointLayer }: PointLayerPanelProps) {
  function updatePointLayer(pointLayerId: string, updater: (pointLayer: PointLayer) => PointLayer) {
    onPointLayersChange(pointLayers.map((pointLayer) => (pointLayer.id === pointLayerId ? updater(pointLayer) : pointLayer)));
  }

  return (
    <section className="panel point-layer-panel">
      <div className="panel-title">
        <h2>Points CSV</h2>
        <span>{pointLayers.length}</span>
      </div>

      {pointLayers.length === 0 ? (
        <p className="muted">Aucun CSV de points importe.</p>
      ) : (
        <div className="point-layer-list">
          {pointLayers.map((pointLayer) => (
            <article className="point-layer-item" key={pointLayer.id}>
              <div className="point-layer-title">
                <strong>{pointLayer.name}</strong>
                <span>{pointLayer.points.length} pts</span>
              </div>
              <div className="layer-controls">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => updatePointLayer(pointLayer.id, (current) => ({ ...current, visible: !current.visible }))}
                  title={pointLayer.visible ? "Masquer" : "Afficher"}
                >
                  {pointLayer.visible ? <Eye size={16} aria-label="Masquer" /> : <EyeOff size={16} aria-label="Afficher" />}
                </button>
                <button type="button" className="icon-button" onClick={() => onFocusPointLayer(pointLayer.id)} title="Centrer">
                  <LocateFixed size={16} aria-label="Centrer" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => onPointLayersChange(pointLayers.filter((current) => current.id !== pointLayer.id))}
                  title="Supprimer"
                >
                  <Trash2 size={16} aria-label="Supprimer" />
                </button>
              </div>
              <div className="layer-meta">
                <span>{pointLayer.sourceProjection}</span>
                <span>{pointLayer.visible ? "Visible" : "Masque"}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
