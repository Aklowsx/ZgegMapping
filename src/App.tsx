import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { ControlPointPanel } from "./components/ControlPointPanel";
import { LayerPanel } from "./components/LayerPanel";
import { MapView } from "./components/MapView";
import { SourceImageView } from "./components/SourceImageView";
import { Toolbar } from "./components/Toolbar";
import type { ControlPoint, ExportMapArea, MapLayer, MapProject } from "./types/project";
import { ipcClient } from "./utils/ipcClient";
import { createEmptyProject, touchProject } from "./utils/projectStore";

type DraftPoint = {
  sourcePixel?: ControlPoint["sourcePixel"];
  targetLatLng?: ControlPoint["targetLatLng"];
};

type OperationProgress = {
  label: string;
  value: number;
  etaSeconds: number;
  estimatedMs: number;
  startedAt: number;
};

type ThemeMode = "day" | "night";

export default function App() {
  const [project, setProject] = useState<MapProject>(() => createEmptyProject());
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("zgeg-theme") === "night" ? "night" : "day"));
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<DraftPoint>({});
  const [status, setStatus] = useState("Pret.");
  const [busy, setBusy] = useState(false);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);
  const [focusLayerRequest, setFocusLayerRequest] = useState<{ layerId: string; nonce: number } | null>(null);
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

  useEffect(() => {
    localStorage.setItem("zgeg-theme", theme);
  }, [theme]);

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
        etaSeconds,
      });
    }, 500);
  }

  function completeProgress() {
    clearProgressTimers();
    setOperationProgress((current) => (current ? { ...current, value: 100, etaSeconds: 0 } : null));
    progressClearTimeoutRef.current = window.setTimeout(() => {
      setOperationProgress(null);
      progressClearTimeoutRef.current = null;
    }, 900);
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
          ? `${point.name} ajoute. Vous pouvez maintenant georeferencer la carte, puis generer les tuiles pour l'afficher sur le fond.`
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
    startProgress("Import de la carte", 10000);
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
      setDraftPoint({});
      setStatus("Carte importee. Placez des points de controle sur les deux vues.");
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
        setProject(result.project);
        setSelectedLayerId(result.project.layers[0]?.id ?? null);
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
    startProgress("Georeferencement", 45000);
    try {
      const result = await ipcClient.georeferenceLayer({ projectName: project.name, layer: selectedLayer });
      if (result.success && result.output) {
        updateLayer(selectedLayer.id, (layer) => ({ ...layer, georefFilePath: result.output }));
        setStatus("GeoTIFF cree avec succes. Generez les tuiles pour afficher la carte sur le fond.");
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
    startProgress("Generation des tuiles", 90000);
    try {
      const result = await ipcClient.generateTiles({ projectName: project.name, layer: selectedLayer });
      if (result.success && result.tilesPath && result.urlTemplate) {
        updateLayer(selectedLayer.id, (layer) => ({
          ...layer,
          tilesPath: result.tilesPath,
          tileUrlTemplate: result.urlTemplate,
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
    setStatus("Export PDF de la zone selectionnee...");
    startProgress("Export PDF", 8000);
    try {
      const result = await ipcClient.exportPdf({ project, selectedLayerId, area: exportSelectionArea });
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

  return (
    <div className="app-shell" data-theme={theme}>
      <Toolbar
        busy={busy}
        projectName={project.name}
        exportSelectionEnabled={exportSelectionEnabled}
        theme={theme}
        onProjectNameChange={(name) => updateProject((current) => ({ ...current, name }))}
        onImport={importMap}
        onSave={saveProject}
        onOpen={openProject}
        onGeoreference={georeferenceLayer}
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
        <section className="source-pane" aria-label="Carte source">
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
            selectedLayerId={selectedLayerId}
            draftPoint={draftPoint.targetLatLng}
            focusLayerRequest={focusLayerRequest}
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
              <span>{operationProgress.etaSeconds > 0 ? `Temps restant estime : ${operationProgress.etaSeconds}s` : "Termine"}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${operationProgress.value}%` }} />
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
