import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { ControlPointPanel } from "./components/ControlPointPanel";
import { CsvPointView } from "./components/CsvPointView";
import { LayerPanel } from "./components/LayerPanel";
import { MapView } from "./components/MapView";
import { PointLayerPanel } from "./components/PointLayerPanel";
import { SourceImageView } from "./components/SourceImageView";
import { Toolbar } from "./components/Toolbar";
import type { ImportMode } from "./components/Toolbar";
import type { ControlPoint, CoordinateProjection, ExportMapArea, MapLayer, MapProject, PointLayer } from "./types/project";
import { BASE_MAPS, DEFAULT_BASE_MAP_ID, getBaseMap } from "./utils/baseMaps";
import { roundedLatLng } from "./utils/coordinateConversion";
import { ipcClient } from "./utils/ipcClient";
import { createEmptyProject, touchProject } from "./utils/projectStore";

type DraftPoint = {
  sourcePixel?: ControlPoint["sourcePixel"];
  targetLatLng?: ControlPoint["targetLatLng"];
};

type OperationProgress = {
  label: string;
  value: number;
  mode: "estimated" | "elapsed" | "complete";
  etaSeconds: number | null;
  elapsedSeconds: number;
  estimatedMs?: number;
  startedAt: number;
};

type ThemeMode = "day" | "night";

export default function App() {
  const [project, setProject] = useState<MapProject>(() => createEmptyProject());
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("zgeg-theme") === "night" ? "night" : "day"));
  const [baseMapId, setBaseMapId] = useState(() => localStorage.getItem("zgeg-basemap") ?? DEFAULT_BASE_MAP_ID);
  const [baseMapOpacity, setBaseMapOpacity] = useState(() => {
    const storedOpacity = Number(localStorage.getItem("zgeg-basemap-opacity"));
    return Number.isFinite(storedOpacity) ? Math.min(1, Math.max(0.15, storedOpacity)) : 1;
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedPointLayerId, setSelectedPointLayerId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("map");
  const [draftPoint, setDraftPoint] = useState<DraftPoint>({});
  const [status, setStatus] = useState("Pret.");
  const [busy, setBusy] = useState(false);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);
  const [focusLayerRequest, setFocusLayerRequest] = useState<{ layerId: string; nonce: number } | null>(null);
  const [focusPointLayerRequest, setFocusPointLayerRequest] = useState<{ pointLayerId: string; nonce: number } | null>(null);
  const [exportSelectionEnabled, setExportSelectionEnabled] = useState(false);
  const [exportSelectionArea, setExportSelectionArea] = useState<ExportMapArea | null>(null);
  const [panelSizes, setPanelSizes] = useState({ source: 520, side: 360 });
  const workspaceRef = useRef<HTMLElement | null>(null);
  const resizeTargetRef = useRef<"source" | "side" | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const progressClearTimeoutRef = useRef<number | null>(null);

  const selectedLayer = useMemo(
    () => project.layers.find((layer) => layer.id === selectedLayerId),
    [project.layers, selectedLayerId],
  );
  const pointLayers = project.pointLayers ?? [];
  const baseMap = useMemo(() => getBaseMap(baseMapId), [baseMapId]);

  useEffect(() => {
    localStorage.setItem("zgeg-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("zgeg-basemap", baseMap.id);
  }, [baseMap.id]);

  useEffect(() => {
    localStorage.setItem("zgeg-basemap-opacity", String(baseMapOpacity));
  }, [baseMapOpacity]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const target = resizeTargetRef.current;
      const workspace = workspaceRef.current;
      if (!target || !workspace) {
        return;
      }

      const rect = workspace.getBoundingClientRect();
      const minSource = 300;
      const minMap = 420;
      const minSide = 300;
      const handleSpace = 24;

      setPanelSizes((current) => {
        if (target === "source") {
          const maxSource = Math.max(minSource, rect.width - current.side - minMap - handleSpace);
          return {
            ...current,
            source: Math.min(Math.max(event.clientX - rect.left, minSource), maxSource),
          };
        }

        const nextSide = rect.right - event.clientX;
        const maxSide = Math.max(minSide, rect.width - current.source - minMap - handleSpace);
        return {
          ...current,
          side: Math.min(Math.max(nextSide, minSide), maxSide),
        };
      });
    }

    function handleMouseUp() {
      resizeTargetRef.current = null;
      document.body.classList.remove("is-resizing");
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("is-resizing");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
      }
      if (progressClearTimeoutRef.current !== null) {
        window.clearTimeout(progressClearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function isEditingText(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    }

    function handleUndo(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "z" || (!event.metaKey && !event.ctrlKey) || event.shiftKey || isEditingText(event.target)) {
        return;
      }

      if (draftPoint.sourcePixel || draftPoint.targetLatLng) {
        event.preventDefault();
        setDraftPoint({});
        setStatus("Point en cours annule.");
        return;
      }

      if (!selectedLayer || selectedLayer.controlPoints.length === 0) {
        return;
      }

      event.preventDefault();
      const removedPoint = selectedLayer.controlPoints.at(-1);
      updateLayer(selectedLayer.id, (layer) => ({
        ...layer,
        controlPoints: layer.controlPoints.slice(0, -1),
      }));
      setStatus(`${removedPoint?.name ?? "Dernier point"} annule.`);
    }

    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [draftPoint, selectedLayer]);

  function startResize(target: "source" | "side", event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeTargetRef.current = target;
    document.body.classList.add("is-resizing");
  }

  function updateProject(updater: (current: MapProject) => MapProject) {
    setProject((current) => touchProject(updater(current)));
  }

  function updateLayer(layerId: string, updater: (layer: MapLayer) => MapLayer) {
    updateProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    }));
  }

  function clearProgressTimers() {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (progressClearTimeoutRef.current !== null) {
      window.clearTimeout(progressClearTimeoutRef.current);
      progressClearTimeoutRef.current = null;
    }
  }

  function startProgress(label: string, estimatedMs: number) {
    clearProgressTimers();
    const startedAt = Date.now();
    setOperationProgress({
      label,
      estimatedMs,
      startedAt,
      value: 3,
      mode: "estimated",
      elapsedSeconds: 0,
      etaSeconds: Math.ceil(estimatedMs / 1000),
    });

    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const rawProgress = elapsed / estimatedMs;
      const easedProgress = 1 - Math.pow(1 - Math.min(rawProgress, 0.98), 2);
      const value = Math.min(94, Math.max(3, Math.round(easedProgress * 94)));
      const etaSeconds = Math.max(1, Math.ceil(Math.max(estimatedMs - elapsed, estimatedMs * 0.08) / 1000));

      setOperationProgress({
        label,
        estimatedMs,
        startedAt,
        value,
        mode: "estimated",
        elapsedSeconds: Math.floor(elapsed / 1000),
        etaSeconds,
      });
    }, 500);
  }

  function startElapsedProgress(label: string) {
    clearProgressTimers();
    const startedAt = Date.now();
    setOperationProgress({
      label,
      startedAt,
      value: 0,
      mode: "elapsed",
      elapsedSeconds: 0,
      etaSeconds: null,
    });

    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setOperationProgress({
        label,
        startedAt,
        value: 0,
        mode: "elapsed",
        elapsedSeconds: Math.floor(elapsed / 1000),
        etaSeconds: null,
      });
    }, 500);
  }

  function completeProgress() {
    clearProgressTimers();
    setOperationProgress((current) => (current ? { ...current, value: 100, mode: "complete", etaSeconds: 0 } : null));
    progressClearTimeoutRef.current = window.setTimeout(() => {
      setOperationProgress(null);
      progressClearTimeoutRef.current = null;
    }, 900);
  }

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}min ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
  }

  function progressMessage(progress: OperationProgress) {
    if (progress.mode === "complete") {
      return "Termine";
    }
    if (progress.mode === "elapsed") {
      return `Temps ecoule : ${formatDuration(progress.elapsedSeconds)}`;
    }
    return progress.etaSeconds !== null && progress.etaSeconds > 0
      ? `Temps restant estime : ${formatDuration(progress.etaSeconds)}`
      : "Termine";
  }

  function addOrCompletePoint(nextDraft: DraftPoint) {
    const merged = { ...draftPoint, ...nextDraft };
    if (!selectedLayer) {
      setStatus("Importez ou selectionnez une couche avant d'ajouter des points.");
      return;
    }

    if (merged.sourcePixel && merged.targetLatLng) {
      const pointIndex = selectedLayer.controlPoints.length + 1;
      const point: ControlPoint = {
        id: `cp-${Date.now()}`,
        name: `Point ${pointIndex}`,
        sourcePixel: merged.sourcePixel,
        targetLatLng: merged.targetLatLng,
      };
      updateLayer(selectedLayer.id, (layer) => ({
        ...layer,
        controlPoints: [...layer.controlPoints, point],
      }));
      setDraftPoint({});
      setStatus(
        pointIndex >= 3
          ? `${point.name} ajoute. Vous pouvez maintenant georeferencer la carte, puis lancer l'apercu rapide.`
          : `${point.name} ajoute. Minimum 3 points, 6 a 10 recommandes pour une carte ancienne ou deformee.`,
      );
    } else {
      setDraftPoint(merged);
      setStatus(merged.sourcePixel ? "Point source defini. Cliquez maintenant sur le fond de carte." : "Point cible defini. Cliquez maintenant sur l'image source.");
    }
  }

  async function importMap() {
    setBusy(true);
    setStatus("Import en cours...");
    startElapsedProgress("Import de la carte");
    try {
      const result = await ipcClient.importMap(project.name);
      if (!result.success || !result.layer) {
        setStatus(result.message);
        return;
      }

      updateProject((current) => ({
        ...current,
        layers: [...current.layers, result.layer as MapLayer],
      }));
      setSelectedLayerId(result.layer.id);
      setImportMode("map");
      setDraftPoint({});
      setStatus("Carte importee. Placez des points de controle sur les deux vues.");
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function importPointCsv() {
    setBusy(true);
    setStatus("Import du CSV de points...");
    startElapsedProgress("Import points CSV");
    try {
      const result = await ipcClient.importPointCsv(project.name);
      if (!result.success || !result.pointLayer) {
        setStatus(result.message);
        return;
      }

      updateProject((current) => ({
        ...current,
        pointLayers: [...(current.pointLayers ?? []), result.pointLayer as PointLayer],
      }));
      setSelectedPointLayerId(result.pointLayer.id);
      setImportMode("points");
      setFocusPointLayerRequest({ pointLayerId: result.pointLayer.id, nonce: Date.now() });
      setStatus(`${result.message}${result.skippedRows ? ` ${result.skippedRows} ligne(s) ignorees.` : ""}`);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function saveProject() {
    setBusy(true);
    setStatus("Sauvegarde du projet...");
    startProgress("Sauvegarde", 2500);
    try {
      const result = await ipcClient.saveProject(project);
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function openProject() {
    setBusy(true);
    setStatus("Ouverture du projet...");
    startProgress("Ouverture du projet", 3000);
    try {
      const result = await ipcClient.openProject();
      if (result.success && result.project) {
        setProject({
          ...result.project,
          layers: result.project.layers ?? [],
          pointLayers: result.project.pointLayers ?? [],
        });
        setSelectedLayerId(result.project.layers[0]?.id ?? null);
        setSelectedPointLayerId(result.project.pointLayers?.[0]?.id ?? null);
        setDraftPoint({});
      }
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function georeferenceLayer() {
    if (!selectedLayer) {
      setStatus("Selectionnez une couche a georeferencer.");
      return;
    }

    if (selectedLayer.controlPoints.length < 3) {
      setStatus("Au moins 3 points de controle sont requis pour un georeferencement affine.");
      return;
    }

    setBusy(true);
    setStatus("Georeferencement en cours avec GDAL...");
    startElapsedProgress("Georeferencement");
    try {
      const result = await ipcClient.georeferenceLayer({ projectName: project.name, layer: selectedLayer });
      if (result.success && result.output) {
        updateLayer(selectedLayer.id, (layer) => ({ ...layer, georefFilePath: result.output }));
        setStatus("GeoTIFF cree avec succes. Lancez l'apercu rapide pour l'afficher sans attendre les tuiles.");
        return;
      }
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function generateOverlay() {
    if (!selectedLayer) {
      setStatus("Selectionnez une couche.");
      return;
    }

    if (!selectedLayer.georefFilePath) {
      setStatus("Georeferencez la couche avant de creer l'apercu rapide.");
      return;
    }

    setBusy(true);
    setStatus("Creation de l'apercu rapide...");
    startElapsedProgress("Apercu rapide");
    try {
      const result = await ipcClient.generateOverlay({ projectName: project.name, layer: selectedLayer });
      if (result.success && result.imagePath && result.imageUrl && result.bounds) {
        updateLayer(selectedLayer.id, (layer) => ({
          ...layer,
          overlayImagePath: result.imagePath,
          overlayImageUrl: result.imageUrl,
          overlayBounds: result.bounds,
          tileUrlTemplate: undefined,
          visible: true,
        }));
        setFocusLayerRequest({ layerId: selectedLayer.id, nonce: Date.now() });
        setStatus("Apercu rapide pret. La carte est affichee sans generation de tuiles.");
        return;
      }
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function generateTiles() {
    if (!selectedLayer) {
      setStatus("Selectionnez une couche.");
      return;
    }

    if (!selectedLayer.georefFilePath) {
      setStatus("Georeferencez la couche avant de generer les tuiles.");
      return;
    }

    setBusy(true);
    setStatus("Generation des tuiles locales...");
    startElapsedProgress("Generation des tuiles");
    try {
      const result = await ipcClient.generateTiles({ projectName: project.name, layer: selectedLayer });
      if (result.success && result.tilesPath && result.urlTemplate) {
        updateLayer(selectedLayer.id, (layer) => ({
          ...layer,
          tilesPath: result.tilesPath,
          tileUrlTemplate: result.urlTemplate,
          overlayImagePath: undefined,
          overlayImageUrl: undefined,
          overlayBounds: undefined,
          visible: true,
        }));
        setStatus("Tuiles locales generees. La carte est maintenant affichee en surcouche si la couche est visible.");
        return;
      }
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!exportSelectionArea) {
      setStatus("Selectionnez d'abord une zone PDF sur la carte.");
      return;
    }

    setBusy(true);
    setStatus("Preparation de la preview PDF detaillee...");
    startElapsedProgress("Preview et export PDF");
    try {
      const result = await ipcClient.exportPdf({ project, selectedLayerId, area: exportSelectionArea, baseMap, baseMapOpacity });
      setStatus(result.message);
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  async function checkDependencies() {
    setBusy(true);
    setStatus("Verification des dependances...");
    startProgress("Verification des dependances", 3500);
    try {
      const result = await ipcClient.checkDependencies();
      if (!result.dependencies) {
        setStatus(result.message);
        return;
      }

      const missing = Object.entries(result.dependencies)
        .filter(([, available]) => !available)
        .map(([name]) => name);
      setStatus(missing.length ? `Dependances manquantes : ${missing.join(", ")}.` : "Toutes les dependances locales sont disponibles.");
    } finally {
      completeProgress();
      setBusy(false);
    }
  }

  function updateControlPoint(point: ControlPoint) {
    if (!selectedLayer) {
      return;
    }

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      controlPoints: layer.controlPoints.map((existing) => (existing.id === point.id ? point : existing)),
    }));
  }

  function deleteControlPoint(pointId: string) {
    if (!selectedLayer) {
      return;
    }

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      controlPoints: layer.controlPoints.filter((point) => point.id !== pointId),
    }));
  }

  function setLayers(layers: MapLayer[]) {
    updateProject((current) => ({ ...current, layers }));
    if (selectedLayerId && !layers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(layers[0]?.id ?? null);
    }
  }

  function setPointLayers(nextPointLayers: PointLayer[]) {
    updateProject((current) => ({ ...current, pointLayers: nextPointLayers }));
    if (selectedPointLayerId && !nextPointLayers.some((pointLayer) => pointLayer.id === selectedPointLayerId)) {
      setSelectedPointLayerId(nextPointLayers[0]?.id ?? null);
    }
  }

  function updatePointLayer(pointLayerId: string, updater: (pointLayer: PointLayer) => PointLayer) {
    updateProject((current) => ({
      ...current,
      pointLayers: (current.pointLayers ?? []).map((pointLayer) => (pointLayer.id === pointLayerId ? updater(pointLayer) : pointLayer)),
    }));
  }

  function updatePointLayerProjection(pointLayerId: string, projection: CoordinateProjection) {
    updatePointLayer(pointLayerId, (pointLayer) => ({
      ...pointLayer,
      sourceProjection: projection,
      points: pointLayer.points.map((point) => ({
        ...point,
        sourceProjection: projection,
        targetLatLng: roundedLatLng(point.source.x, point.source.y, projection),
      })),
    }));
    setFocusPointLayerRequest({ pointLayerId, nonce: Date.now() });
    setStatus(`Projection des points : ${projection}.`);
  }

  function pointLayerColumns(pointLayer: PointLayer) {
    return pointLayer.columns ?? Object.keys(pointLayer.points[0]?.properties ?? {});
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <Toolbar
        busy={busy}
        projectName={project.name}
        exportSelectionEnabled={exportSelectionEnabled}
        theme={theme}
        importMode={importMode}
        baseMaps={BASE_MAPS}
        baseMapId={baseMap.id}
        baseMapOpacity={baseMapOpacity}
        onImportModeChange={(nextImportMode) => {
          setImportMode(nextImportMode);
          setStatus(nextImportMode === "points" ? "Mode import points CSV." : "Mode import carte.");
        }}
        onProjectNameChange={(name) => updateProject((current) => ({ ...current, name }))}
        onBaseMapChange={(nextBaseMapId) => {
          const nextBaseMap = getBaseMap(nextBaseMapId);
          setBaseMapId(nextBaseMap.id);
          setStatus(`Fond de carte : ${nextBaseMap.name}.`);
        }}
        onBaseMapOpacityChange={(opacity) => {
          setBaseMapOpacity(opacity);
          setStatus(`Opacite du fond : ${Math.round(opacity * 100)}%.`);
        }}
        onImport={importMap}
        onImportPoints={importPointCsv}
        onSave={saveProject}
        onOpen={openProject}
        onGeoreference={georeferenceLayer}
        onGenerateOverlay={generateOverlay}
        onGenerateTiles={generateTiles}
        onToggleExportSelection={() => {
          setExportSelectionEnabled((enabled) => {
            const next = !enabled;
            setStatus(next ? "Mode selection PDF actif : glissez sur la carte pour definir la zone." : "Mode selection PDF desactive.");
            return next;
          });
        }}
        onExportPdf={exportPdf}
        onToggleTheme={() => setTheme((current) => (current === "day" ? "night" : "day"))}
        onCheckDependencies={checkDependencies}
      />

      <main
        className="workspace"
        ref={workspaceRef}
        style={{
          gridTemplateColumns: `${panelSizes.source}px 12px minmax(420px, 1fr) 12px ${panelSizes.side}px`,
        }}
      >
        {operationProgress ? (
          <div className="progress-overlay" role="status" aria-live="polite">
            <div className="progress-overlay-panel">
              <div className="progress-meta">
                <span>{operationProgress.label}</span>
                <span>{progressMessage(operationProgress)}</span>
              </div>
              <div className={`progress-track ${operationProgress.mode === "elapsed" ? "is-elapsed" : ""}`}>
                <div className="progress-fill" style={operationProgress.mode === "elapsed" ? undefined : { width: `${operationProgress.value}%` }} />
              </div>
            </div>
          </div>
        ) : null}
        <section className="source-pane" aria-label={importMode === "points" ? "Points CSV" : "Carte source"}>
          {importMode === "points" ? (
            <CsvPointView
              pointLayers={pointLayers}
              selectedPointLayerId={selectedPointLayerId}
              onSelectPointLayer={(pointLayerId) => {
                setSelectedPointLayerId(pointLayerId);
                setFocusPointLayerRequest({ pointLayerId, nonce: Date.now() });
              }}
              onFocusPointLayer={(pointLayerId) => setFocusPointLayerRequest({ pointLayerId, nonce: Date.now() })}
              onProjectionChange={updatePointLayerProjection}
              onShowLabelsChange={(pointLayerId, showLabels) =>
                updatePointLayer(pointLayerId, (pointLayer) => ({
                  ...pointLayer,
                  showLabels,
                  labelColumn: pointLayer.labelColumn ?? pointLayerColumns(pointLayer)[0],
                }))
              }
              onLabelColumnChange={(pointLayerId, labelColumn) =>
                updatePointLayer(pointLayerId, (pointLayer) => ({
                  ...pointLayer,
                  labelColumn,
                }))
              }
            />
          ) : (
            <SourceImageView
              layers={project.layers}
              layer={selectedLayer}
              selectedLayerId={selectedLayerId}
              draftPoint={draftPoint.sourcePixel}
              onSelectLayer={(layerId) => {
                setSelectedLayerId(layerId);
                setDraftPoint({});
              }}
              onPickSource={(sourcePixel) => addOrCompletePoint({ sourcePixel })}
            />
          )}
        </section>

        <button
          type="button"
          className="resize-handle"
          onMouseDown={(event) => startResize("source", event)}
          aria-label="Redimensionner la carte importee"
          title="Redimensionner"
        />

        <section className="map-pane" aria-label="Fond de carte">
          <MapView
            layers={project.layers}
            pointLayers={pointLayers}
            baseMap={baseMap}
            baseMapOpacity={baseMapOpacity}
            selectedLayerId={selectedLayerId}
            draftPoint={draftPoint.targetLatLng}
            focusLayerRequest={focusLayerRequest}
            focusPointLayerRequest={focusPointLayerRequest}
            exportSelectionEnabled={exportSelectionEnabled}
            onPickTarget={(targetLatLng) => addOrCompletePoint({ targetLatLng })}
            onExportAreaChange={(area) => {
              setExportSelectionArea(area);
              if (area) {
                setStatus("Zone PDF selectionnee. Lancez l'export quand la carte vous convient.");
              }
            }}
            onExportViewportChange={() => undefined}
          />
        </section>

        <button
          type="button"
          className="resize-handle"
          onMouseDown={(event) => startResize("side", event)}
          aria-label="Redimensionner le panneau lateral"
          title="Redimensionner"
        />

        <aside className="side-pane" aria-label="Couches et points">
          <LayerPanel
            layers={project.layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={(layerId) => {
              setSelectedLayerId(layerId);
              setDraftPoint({});
            }}
            onLayersChange={setLayers}
            onFocusLayer={(layerId) => setFocusLayerRequest({ layerId, nonce: Date.now() })}
          />
          <PointLayerPanel
            pointLayers={pointLayers}
            onPointLayersChange={setPointLayers}
            onFocusPointLayer={(pointLayerId) => {
              setSelectedPointLayerId(pointLayerId);
              setFocusPointLayerRequest({ pointLayerId, nonce: Date.now() });
            }}
          />
          <ControlPointPanel
            layer={selectedLayer}
            draftPoint={draftPoint}
            onPointChange={updateControlPoint}
            onPointDelete={deleteControlPoint}
          />
        </aside>
      </main>

      <footer className="status-bar">
        <span className="status-message">{status}</span>
        {operationProgress ? (
          <div className="operation-progress" aria-label={`${operationProgress.label} ${operationProgress.value}%`}>
            <div className="progress-meta">
              <span>{operationProgress.label}</span>
              <span>{progressMessage(operationProgress)}</span>
            </div>
            <div className={`progress-track ${operationProgress.mode === "elapsed" ? "is-elapsed" : ""}`}>
              <div className="progress-fill" style={operationProgress.mode === "elapsed" ? undefined : { width: `${operationProgress.value}%` }} />
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
