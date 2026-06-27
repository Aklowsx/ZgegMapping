import { Trash2 } from "lucide-react";
import type { ControlPoint, MapLayer } from "../types/project";

type DraftPoint = {
  sourcePixel?: ControlPoint["sourcePixel"];
  targetLatLng?: ControlPoint["targetLatLng"];
};

type ControlPointPanelProps = {
  layer?: MapLayer;
  draftPoint: DraftPoint;
  onPointChange(point: ControlPoint): void;
  onPointDelete(pointId: string): void;
};

export function ControlPointPanel({ layer, draftPoint, onPointChange, onPointDelete }: ControlPointPanelProps) {
  return (
    <section className="panel control-panel">
      <div className="panel-title">
        <h2>Points de controle</h2>
        <span>{layer?.controlPoints.length ?? 0}</span>
      </div>

      <div className="hint">
        Minimum 3 points. Pour une carte ancienne, scannee ou deformee, utilisez plutot 6 a 10 points bien repartis.
      </div>

      <div className="draft-row">
        <span>Source: {draftPoint.sourcePixel ? `${draftPoint.sourcePixel.x}, ${draftPoint.sourcePixel.y}` : "en attente"}</span>
        <span>
          Cible: {draftPoint.targetLatLng ? `${draftPoint.targetLatLng.lat.toFixed(5)}, ${draftPoint.targetLatLng.lng.toFixed(5)}` : "en attente"}
        </span>
      </div>

      {!layer ? (
        <p className="muted">Selectionnez une couche.</p>
      ) : layer.controlPoints.length === 0 ? (
        <p className="muted">Cliquez une fois sur l'image source et une fois sur la carte.</p>
      ) : (
        <div className="point-list">
          {layer.controlPoints.map((point) => (
            <article className="point-item" key={point.id}>
              <div className="point-row">
                <input
                  value={point.name}
                  onChange={(event) => onPointChange({ ...point, name: event.target.value })}
                  aria-label="Nom du point"
                />
                <button type="button" className="icon-button danger" onClick={() => onPointDelete(point.id)} title="Supprimer le point">
                  <Trash2 size={16} aria-label="Supprimer le point" />
                </button>
              </div>
              <div className="point-grid">
                <label>
                  <span>X</span>
                  <input
                    type="number"
                    value={point.sourcePixel.x}
                    onChange={(event) =>
                      onPointChange({ ...point, sourcePixel: { ...point.sourcePixel, x: Number(event.target.value) } })
                    }
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    type="number"
                    value={point.sourcePixel.y}
                    onChange={(event) =>
                      onPointChange({ ...point, sourcePixel: { ...point.sourcePixel, y: Number(event.target.value) } })
                    }
                  />
                </label>
                <label>
                  <span>Lat</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.targetLatLng.lat}
                    onChange={(event) =>
                      onPointChange({ ...point, targetLatLng: { ...point.targetLatLng, lat: Number(event.target.value) } })
                    }
                  />
                </label>
                <label>
                  <span>Lng</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.targetLatLng.lng}
                    onChange={(event) =>
                      onPointChange({ ...point, targetLatLng: { ...point.targetLatLng, lng: Number(event.target.value) } })
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
