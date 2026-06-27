import { ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import type { ControlPoint, MapLayer } from "../types/project";

type DraftPoint = {
  sourcePixel?: ControlPoint["sourcePixel"];
  targetLatLng?: ControlPoint["targetLatLng"];
};

type ControlPointPanelProps = {
  layer?: MapLayer;
  draftPoint: DraftPoint;
  isOpen: boolean;
  onPointAdd(): void;
  onToggleOpen(): void;
  onAssignInfo(point: ControlPoint): void;
  onPointChange(point: ControlPoint): void;
  onPointDelete(pointId: string): void;
};

export function ControlPointPanel({ layer, draftPoint, isOpen, onPointAdd, onToggleOpen, onAssignInfo, onPointChange, onPointDelete }: ControlPointPanelProps) {
  return (
    <section className={`panel control-panel accordion-panel ${isOpen ? "is-open" : ""}`}>
      <div className="panel-title">
        <button type="button" className="panel-title-toggle" onClick={onToggleOpen} aria-expanded={isOpen}>
          <ChevronDown size={16} aria-hidden="true" />
          <h2>Points de controle</h2>
        </button>
        <div className="panel-title-actions">
          <span>{layer?.controlPoints.length ?? 0}</span>
          <button type="button" className="icon-button" onClick={onPointAdd} disabled={!layer} title="Ajouter un point de controle">
            <Plus size={16} aria-label="Ajouter un point de controle" />
          </button>
        </div>
      </div>

      {!isOpen ? null : (
        <>
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
            <p className="muted">Cliquez sur + puis sur la carte, ou cliquez une fois sur l'image source et une fois sur la carte.</p>
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
                <button type="button" className="icon-button" onClick={() => onAssignInfo(point)} title="Assigner comme point d'info">
                  <Info size={16} aria-label="Assigner comme point d'info" />
                </button>
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
              <label className="point-comment">
                <span>Commentaire</span>
                <textarea
                  value={point.comment ?? ""}
                  onChange={(event) => onPointChange({ ...point, comment: event.target.value })}
                  rows={2}
                  placeholder="Note sur ce point de georeferencement"
                />
              </label>
            </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
