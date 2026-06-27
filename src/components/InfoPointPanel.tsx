import { ChevronDown, Crosshair, Info, Plus, Trash2 } from "lucide-react";
import type { InfoPoint } from "../types/project";

type InfoPointPanelProps = {
  infoPoints: InfoPoint[];
  canAssignControl: boolean;
  isOpen: boolean;
  onPointAdd(): void;
  onToggleOpen(): void;
  onPointChange(point: InfoPoint): void;
  onPointDelete(pointId: string): void;
  onAssignControl(point: InfoPoint): void;
};

export function InfoPointPanel({
  infoPoints,
  canAssignControl,
  isOpen,
  onPointAdd,
  onToggleOpen,
  onPointChange,
  onPointDelete,
  onAssignControl,
}: InfoPointPanelProps) {
  return (
    <section className={`panel info-point-panel accordion-panel ${isOpen ? "is-open" : ""}`}>
      <div className="panel-title">
        <button type="button" className="panel-title-toggle" onClick={onToggleOpen} aria-expanded={isOpen}>
          <ChevronDown size={16} aria-hidden="true" />
          <h2>Points d'info</h2>
        </button>
        <div className="panel-title-actions">
          <span>{infoPoints.length}</span>
          <button type="button" className="icon-button" onClick={onPointAdd} title="Ajouter un point d'info">
            <Plus size={16} aria-label="Ajouter un point d'info" />
          </button>
        </div>
      </div>

      {!isOpen ? null : infoPoints.length === 0 ? (
        <p className="muted panel-empty">Cliquez sur + puis sur la carte, ou assignez un point de controle.</p>
      ) : (
        <div className="info-point-list">
          {infoPoints.map((point) => (
            <article className="point-item" key={point.id}>
              <div className="point-row">
                <input value={point.name} onChange={(event) => onPointChange({ ...point, name: event.target.value })} aria-label="Nom du point d'info" />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onAssignControl(point)}
                  disabled={!canAssignControl}
                  title="Assigner comme point de controle"
                >
                  <Crosshair size={16} aria-label="Assigner comme point de controle" />
                </button>
                <button type="button" className="icon-button danger" onClick={() => onPointDelete(point.id)} title="Supprimer le point d'info">
                  <Trash2 size={16} aria-label="Supprimer le point d'info" />
                </button>
              </div>
              <label className="point-info-export">
                <input
                  type="checkbox"
                  checked={point.exportEnabled !== false}
                  onChange={(event) => onPointChange({ ...point, exportEnabled: event.target.checked })}
                />
                <span>Mettre a l'export PDF</span>
              </label>
              <div className="point-grid">
                <label>
                  <span>Lat</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.targetLatLng.lat}
                    onChange={(event) => onPointChange({ ...point, targetLatLng: { ...point.targetLatLng, lat: Number(event.target.value) } })}
                  />
                </label>
                <label>
                  <span>Lng</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.targetLatLng.lng}
                    onChange={(event) => onPointChange({ ...point, targetLatLng: { ...point.targetLatLng, lng: Number(event.target.value) } })}
                  />
                </label>
              </div>
              <label className="point-comment">
                <span>Commentaire</span>
                <textarea
                  value={point.comment ?? ""}
                  onChange={(event) => onPointChange({ ...point, comment: event.target.value })}
                  rows={2}
                  placeholder="Information a garder sur ce point"
                />
              </label>
              <div className="info-point-meta">
                <Info size={14} aria-hidden="true" />
                <span>Visible sur la carte et exportable en PDF.</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
