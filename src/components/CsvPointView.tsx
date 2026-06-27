import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { CoordinateProjection, PointLayer } from "../types/project";
import { COORDINATE_PROJECTIONS } from "../utils/coordinateConversion";

type CsvPointViewProps = {
  pointLayers: PointLayer[];
  selectedPointLayerId: string | null;
  onSelectPointLayer(pointLayerId: string): void;
  onFocusPointLayer(pointLayerId: string): void;
  onProjectionChange(pointLayerId: string, projection: CoordinateProjection): void;
  onShowLabelsChange(pointLayerId: string, showLabels: boolean): void;
  onLabelColumnChange(pointLayerId: string, labelColumn: string): void;
  onExportAllChange(pointLayerId: string, exportEnabled: boolean): void;
};

export function CsvPointView({
  pointLayers,
  selectedPointLayerId,
  onSelectPointLayer,
  onFocusPointLayer,
  onProjectionChange,
  onShowLabelsChange,
  onLabelColumnChange,
  onExportAllChange,
}: CsvPointViewProps) {
  const [optionsHeight, setOptionsHeight] = useState(() => {
    const storedHeight = Number(localStorage.getItem("zgeg-csv-options-height"));
    return Number.isFinite(storedHeight) ? Math.min(420, Math.max(150, storedHeight)) : 240;
  });
  const viewRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef({
    active: false,
    startY: 0,
    startHeight: 0,
  });
  const selectedPointLayer = pointLayers.find((pointLayer) => pointLayer.id === selectedPointLayerId) ?? pointLayers[0];
  const columns = selectedPointLayer?.columns ?? Object.keys(selectedPointLayer?.points[0]?.properties ?? {});
  const labelColumn = selectedPointLayer?.labelColumn ?? columns[0] ?? "";
  const exportableCount = selectedPointLayer?.points.filter((point) => point.exportEnabled !== false).length ?? 0;
  const allPointsExported = selectedPointLayer ? selectedPointLayer.points.every((point) => point.exportEnabled !== false) : true;

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const current = resizeRef.current;
      const view = viewRef.current;
      if (!current.active || !view) {
        return;
      }

      const maxHeight = Math.max(150, view.clientHeight - 170);
      const nextHeight = Math.min(maxHeight, Math.max(150, current.startHeight - (event.clientY - current.startY)));
      setOptionsHeight(nextHeight);
      localStorage.setItem("zgeg-csv-options-height", String(Math.round(nextHeight)));
    }

    function handleMouseUp() {
      resizeRef.current.active = false;
      document.body.classList.remove("is-resizing-row");
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("is-resizing-row");
    };
  }, []);

  function startOptionsResize(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeRef.current = {
      active: true,
      startY: event.clientY,
      startHeight: optionsHeight,
    };
    document.body.classList.add("is-resizing-row");
  }

  function renderPointLayerSelect() {
    if (pointLayers.length <= 1) {
      return null;
    }

    return (
      <label className="source-layer-select">
        <span>CSV</span>
        <select value={selectedPointLayer?.id ?? ""} onChange={(event) => onSelectPointLayer(event.target.value)} aria-label="CSV de points actif">
          {pointLayers.map((pointLayer) => (
            <option value={pointLayer.id} key={pointLayer.id}>
              {pointLayer.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (!selectedPointLayer) {
    return (
      <div className="source-view">
        <div className="pane-header">
          <h2>Points CSV</h2>
        </div>
        <div className="empty-state">
          <p>Selectionnez Points CSV dans le menu d'import, puis importez un fichier de points.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="source-view">
      <div className="pane-header">
        <div className="source-title">
          <h2>{selectedPointLayer.name}</h2>
          {renderPointLayerSelect()}
        </div>
        <button type="button" onClick={() => onFocusPointLayer(selectedPointLayer.id)} title="Centrer les points">
          Centrer
        </button>
      </div>

      <div
        className="csv-point-view"
        ref={viewRef}
        style={{ gridTemplateRows: `minmax(160px, 1fr) 8px ${Math.round(optionsHeight)}px` }}
      >
        <div className="csv-display">
          <div className="csv-summary">
            <span>{selectedPointLayer.points.length} points</span>
            <span>{exportableCount} export</span>
            <span>{selectedPointLayer.sourceProjection}</span>
            <span>{selectedPointLayer.visible ? "Visible" : "Masque"}</span>
          </div>

          <div className="csv-table-wrap">
            <table className="csv-point-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>X source</th>
                  <th>Y source</th>
                  <th>Projection</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                </tr>
              </thead>
              <tbody>
                {selectedPointLayer.points.map((point) => (
                  <tr key={point.id}>
                    <td title={point.name}>{point.name}</td>
                    <td>{point.source.x.toFixed(2)}</td>
                    <td>{point.source.y.toFixed(2)}</td>
                    <td>{point.sourceProjection}</td>
                    <td>{point.targetLatLng.lat.toFixed(7)}</td>
                    <td>{point.targetLatLng.lng.toFixed(7)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button
          type="button"
          className="csv-resize-handle"
          onMouseDown={startOptionsResize}
          aria-label="Redimensionner le tableau CSV et les options"
          title="Redimensionner"
        />

        <div className="csv-options">
          <div className="csv-option-title">Options</div>
          <label className="csv-checkbox-row">
            <input
              type="checkbox"
              checked={allPointsExported}
              onChange={(event) => onExportAllChange(selectedPointLayer.id, event.target.checked)}
            />
            <span>Inclure tous les points a l'export</span>
          </label>
          <label>
            <span>Convertisseur des points</span>
            <select value={selectedPointLayer.sourceProjection} onChange={(event) => onProjectionChange(selectedPointLayer.id, event.target.value as CoordinateProjection)}>
              {COORDINATE_PROJECTIONS.map((projection) => (
                <option key={projection.id} value={projection.id}>
                  {projection.id} - {projection.label}
                </option>
              ))}
            </select>
          </label>

          <label className="csv-checkbox-row">
            <input
              type="checkbox"
              checked={selectedPointLayer.showLabels}
              onChange={(event) => onShowLabelsChange(selectedPointLayer.id, event.target.checked)}
            />
            <span>Afficher un nom au point</span>
          </label>

          {selectedPointLayer.showLabels ? (
            <label>
              <span>Colonne du nom</span>
              <select value={labelColumn} onChange={(event) => onLabelColumnChange(selectedPointLayer.id, event.target.value)}>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
