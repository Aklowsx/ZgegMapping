import type React from "react";
import { Eraser, Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BackgroundRemovalSettings, ControlPoint, MapLayer } from "../types/project";
import { filePathToUrl, layerDisplayImage } from "../utils/leafletHelpers";

type SourceImageViewProps = {
  layers: MapLayer[];
  layer?: MapLayer;
  selectedLayerId: string | null;
  draftPoint?: ControlPoint["sourcePixel"];
  busy: boolean;
  onSelectLayer(layerId: string): void;
  onPickSource(point: ControlPoint["sourcePixel"]): void;
  onRemoveBackground(layerId: string, settings: BackgroundRemovalSettings): void;
};

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

const maxZoom = 8;
const minZoomFloor = 0.02;

export function SourceImageView({
  layers,
  layer,
  selectedLayerId,
  draftPoint,
  busy,
  onSelectLayer,
  onPickSource,
  onRemoveBackground,
}: SourceImageViewProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#000000");
  const [backgroundTolerance, setBackgroundTolerance] = useState(16);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const suppressNextClickRef = useRef(false);
  const imagePath = layerDisplayImage(layer);
  const imageUrl = filePathToUrl(imagePath);

  function fitZoomFor(size = naturalSize, viewport = viewportSize) {
    if (!size.width || !size.height || !viewport.width || !viewport.height) {
      return 1;
    }

    return Math.max(minZoomFloor, Math.min(1, Math.min(viewport.width / size.width, viewport.height / size.height) * 0.96));
  }

  function clampZoom(value: number, size = naturalSize, viewport = viewportSize) {
    return Math.min(Math.max(value, fitZoomFor(size, viewport)), maxZoom);
  }

  function clampPan(nextPan: Point, nextZoom = zoom, size = naturalSize, viewport = viewportSize) {
    if (!size.width || !size.height || !viewport.width || !viewport.height) {
      return nextPan;
    }

    const scaledWidth = size.width * nextZoom;
    const scaledHeight = size.height * nextZoom;
    const x =
      scaledWidth <= viewport.width
        ? (viewport.width - scaledWidth) / 2
        : Math.min(0, Math.max(viewport.width - scaledWidth, nextPan.x));
    const y =
      scaledHeight <= viewport.height
        ? (viewport.height - scaledHeight) / 2
        : Math.min(0, Math.max(viewport.height - scaledHeight, nextPan.y));

    return { x, y };
  }

  function centeredPan(nextZoom: number, size = naturalSize, viewport = viewportSize) {
    return clampPan(
      {
        x: (viewport.width - size.width * nextZoom) / 2,
        y: (viewport.height - size.height * nextZoom) / 2,
      },
      nextZoom,
      size,
      viewport,
    );
  }

  function setZoomAroundPoint(nextZoomValue: number, anchor: Point) {
    const nextZoom = clampZoom(Number(nextZoomValue.toFixed(4)));
    const imageX = (anchor.x - pan.x) / zoom;
    const imageY = (anchor.y - pan.y) / zoom;

    setZoom(nextZoom);
    setPan(clampPan({ x: anchor.x - imageX * nextZoom, y: anchor.y - imageY * nextZoom }, nextZoom));
  }

  function updateZoom(nextZoomValue: number) {
    setZoomAroundPoint(nextZoomValue, {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    });
  }

  function fitImageToViewport(size = naturalSize, viewport = viewportSize) {
    const nextZoom = fitZoomFor(size, viewport);
    setZoom(nextZoom);
    setPan(centeredPan(nextZoom, size, viewport));
  }

  function handleClick(event: React.MouseEvent<HTMLImageElement>) {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * image.naturalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * image.naturalHeight;
    onPickSource({ x: Math.round(x), y: Math.round(y) });
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }

    const rect = wrap.getBoundingClientRect();
    setZoomAroundPoint(zoom * (event.deltaY > 0 ? 0.88 : 1.12), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    panRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsPanning(true);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const currentPan = panRef.current;
    if (!currentPan.active) {
      return;
    }

    const dx = event.clientX - currentPan.startX;
    const dy = event.clientY - currentPan.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      currentPan.moved = true;
      suppressNextClickRef.current = true;
    }

    setPan(clampPan({ x: currentPan.panX + dx, y: currentPan.panY + dy }));
  }

  function stopPanning() {
    panRef.current.active = false;
    setIsPanning(false);
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const nextSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };
    const nextViewport = {
      width: wrapRef.current?.clientWidth ?? viewportSize.width,
      height: wrapRef.current?.clientHeight ?? viewportSize.height,
    };
    const nextZoom = fitZoomFor(nextSize, nextViewport);

    setNaturalSize(nextSize);
    setViewportSize(nextViewport);
    setZoom(nextZoom);
    setPan(centeredPan(nextZoom, nextSize, nextViewport));
  }

  function renderLayerSelect() {
    if (layers.length <= 1) {
      return null;
    }

    return (
      <label className="source-layer-select">
        <span>Carte</span>
        <select value={selectedLayerId ?? ""} onChange={(event) => onSelectLayer(event.target.value)} aria-label="Carte source active">
          {layers.map((candidate) => (
            <option value={candidate.id} key={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
    setViewportSize({ width: 0, height: 0 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);

  useEffect(() => {
    setRemoveBackgroundEnabled(layer?.backgroundRemoval?.enabled ?? false);
    setBackgroundColor(layer?.backgroundRemoval?.color ?? "#000000");
    setBackgroundTolerance(layer?.backgroundRemoval?.tolerance ?? 16);
  }, [layer?.id, layer?.backgroundRemoval?.enabled, layer?.backgroundRemoval?.color, layer?.backgroundRemoval?.tolerance]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const activeWrap = wrap;

    function updateViewport() {
      const nextViewport = {
        width: activeWrap.clientWidth,
        height: activeWrap.clientHeight,
      };
      setViewportSize(nextViewport);
      setPan((current) => clampPan(current, zoom, naturalSize, nextViewport));
    }

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(activeWrap);
    return () => observer.disconnect();
  }, [imageUrl, naturalSize, zoom]);

  if (!layer || !imageUrl) {
    return (
      <div className="source-view">
        <div className="pane-header">
          <h2>Carte source</h2>
          {renderLayerSelect()}
        </div>
        <div className="empty-state">
          <p>Importez une image ou un PDF pour commencer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="source-view">
      <div className="pane-header">
        <div className="source-title">
          <h2>{layer.name}</h2>
          {renderLayerSelect()}
        </div>
        <div className="source-tools" aria-label="Zoom carte source">
          <button type="button" className="icon-button" onClick={() => updateZoom(zoom * 0.84)} title="Dezoomer">
            <Minus size={16} aria-label="Dezoomer" />
          </button>
          <input
            type="range"
            min={fitZoomFor()}
            max={maxZoom}
            step="0.01"
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            aria-label="Zoom de la carte source"
          />
          <button type="button" className="icon-button" onClick={() => updateZoom(zoom * 1.16)} title="Zoomer">
            <Plus size={16} aria-label="Zoomer" />
          </button>
          <button type="button" className="icon-button" onClick={() => fitImageToViewport()} title="Ajuster a la zone">
            <Maximize2 size={16} aria-label="Ajuster a la zone" />
          </button>
          <strong>{Math.round(zoom * 100)}%</strong>
        </div>
      </div>
      <div className="background-removal-controls">
        <label className="background-removal-check">
          <input type="checkbox" checked={removeBackgroundEnabled} onChange={(event) => setRemoveBackgroundEnabled(event.target.checked)} disabled={busy} />
          <span>Supprimer le fond par couleur</span>
        </label>
        <label>
          <span>Couleur</span>
          <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} disabled={busy || !removeBackgroundEnabled} />
        </label>
        <label className="background-tolerance">
          <span>Tolerance</span>
          <input
            type="range"
            min="0"
            max="96"
            step="1"
            value={backgroundTolerance}
            onChange={(event) => setBackgroundTolerance(Number(event.target.value))}
            disabled={busy || !removeBackgroundEnabled}
          />
          <strong>{backgroundTolerance}</strong>
        </label>
        <button
          type="button"
          onClick={() =>
            onRemoveBackground(layer.id, {
              enabled: removeBackgroundEnabled,
              color: backgroundColor,
              tolerance: backgroundTolerance,
            })
          }
          disabled={busy || !removeBackgroundEnabled}
          title="Generer une source PNG transparente"
        >
          <Eraser size={16} aria-hidden="true" />
          Appliquer
        </button>
      </div>
      <div
        className={`source-image-wrap ${isPanning ? "is-panning" : ""}`}
        ref={wrapRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPanning}
        onMouseLeave={stopPanning}
      >
        <div
          className="source-canvas"
          style={{
            width: `${naturalSize.width}px`,
            height: `${naturalSize.height}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            src={imageUrl}
            alt={`Carte source ${layer.name}`}
            onClick={handleClick}
            onLoad={handleImageLoad}
            style={{
              width: `${naturalSize.width}px`,
              height: `${naturalSize.height}px`,
            }}
            draggable={false}
          />
        </div>

        {layer.controlPoints.map((point) => (
          <span
            className="source-marker"
            key={point.id}
            style={{
              left: `${pan.x + point.sourcePixel.x * zoom}px`,
              top: `${pan.y + point.sourcePixel.y * zoom}px`,
            }}
            title={point.name}
          >
            {point.name.replace(/\D/g, "") || "P"}
          </span>
        ))}
        {draftPoint ? (
          <span className="source-marker draft" style={{ left: `${pan.x + draftPoint.x * zoom}px`, top: `${pan.y + draftPoint.y * zoom}px` }}>
            +
          </span>
        ) : null}
      </div>
    </div>
  );
}
