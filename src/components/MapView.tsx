import L from "leaflet";
import { useEffect, useRef } from "react";
import type { ControlPoint, ExportMapArea, MapLayer } from "../types/project";
import { controlPointBounds } from "../utils/leafletHelpers";

type MapViewProps = {
  layers: MapLayer[];
  selectedLayerId: string | null;
  draftPoint?: ControlPoint["targetLatLng"];
  focusLayerRequest: { layerId: string; nonce: number } | null;
  exportSelectionEnabled: boolean;
  onPickTarget(point: ControlPoint["targetLatLng"]): void;
  onExportAreaChange(area: ExportMapArea | null): void;
  onExportViewportChange(area: ExportMapArea | null): void;
};

export function MapView({
  layers,
  selectedLayerId,
  draftPoint,
  focusLayerRequest,
  exportSelectionEnabled,
  onPickTarget,
  onExportAreaChange,
  onExportViewportChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<Map<string, L.TileLayer>>(new Map());
  const markersRef = useRef<L.LayerGroup | null>(null);
  const exportSelectionEnabledRef = useRef(exportSelectionEnabled);
  const selectionStartRef = useRef<L.LatLng | null>(null);
  const selectionRectangleRef = useRef<L.Rectangle | null>(null);
  const onPickTargetRef = useRef(onPickTarget);

  useEffect(() => {
    onPickTargetRef.current = onPickTarget;
  }, [onPickTarget]);

  useEffect(() => {
    exportSelectionEnabledRef.current = exportSelectionEnabled;
  }, [exportSelectionEnabled]);

  function areaFromBounds(bounds: L.LatLngBounds, mode: ExportMapArea["mode"]): ExportMapArea | null {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) {
      return null;
    }

    const normalizedBounds = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
    const northWest = map.latLngToContainerPoint(normalizedBounds.getNorthWest());
    const southEast = map.latLngToContainerPoint(normalizedBounds.getSouthEast());
    const containerRect = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(northWest.x, southEast.x));
    const top = Math.max(0, Math.min(northWest.y, southEast.y));
    const right = Math.min(containerRect.width, Math.max(northWest.x, southEast.x));
    const bottom = Math.min(containerRect.height, Math.max(northWest.y, southEast.y));
    const width = Math.round(right - left);
    const height = Math.round(bottom - top);

    if (width < 24 || height < 24) {
      return null;
    }

    const center = normalizedBounds.getCenter();
    return {
      mode,
      bounds: {
        north: Number(normalizedBounds.getNorth().toFixed(7)),
        south: Number(normalizedBounds.getSouth().toFixed(7)),
        east: Number(normalizedBounds.getEast().toFixed(7)),
        west: Number(normalizedBounds.getWest().toFixed(7)),
      },
      center: {
        lat: Number(center.lat.toFixed(7)),
        lng: Number(center.lng.toFixed(7)),
      },
      zoom: map.getZoom(),
      captureRect: {
        x: Math.round(containerRect.left + left),
        y: Math.round(containerRect.top + top),
        width,
        height,
      },
    };
  }

  function publishViewportArea() {
    const map = mapRef.current;
    if (!map) {
      onExportViewportChange(null);
      return;
    }

    onExportViewportChange(areaFromBounds(map.getBounds(), "viewport"));
    if (selectionRectangleRef.current) {
      onExportAreaChange(areaFromBounds(selectionRectangleRef.current.getBounds(), "selection"));
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [48.8566, 2.3522],
      zoom: 13,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (exportSelectionEnabledRef.current) {
        return;
      }

      onPickTargetRef.current({
        lat: Number(event.latlng.lat.toFixed(7)),
        lng: Number(event.latlng.lng.toFixed(7)),
      });
    });
    map.on("moveend zoomend", publishViewportArea);

    mapRef.current = map;
    publishViewportArea();
    return () => {
      map.remove();
      mapRef.current = null;
      overlaysRef.current.clear();
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
      publishViewportArea();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (exportSelectionEnabled) {
      map.dragging.disable();
      map.getContainer().classList.add("is-export-selecting");
    } else {
      map.dragging.enable();
      map.getContainer().classList.remove("is-export-selecting");
      selectionStartRef.current = null;
    }

    return () => {
      map.dragging.enable();
      map.getContainer().classList.remove("is-export-selecting");
    };
  }, [exportSelectionEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const activeMap = map;

    function handleMouseDown(event: L.LeafletMouseEvent) {
      if (!exportSelectionEnabledRef.current) {
        return;
      }

      L.DomEvent.stop(event.originalEvent);
      selectionStartRef.current = event.latlng;

      if (selectionRectangleRef.current) {
        selectionRectangleRef.current.removeFrom(activeMap);
      }

      selectionRectangleRef.current = L.rectangle(L.latLngBounds(event.latlng, event.latlng), {
        color: "#f97316",
        weight: 2,
        fillColor: "#facc15",
        fillOpacity: 0.16,
        dashArray: "6",
      }).addTo(activeMap);
      onExportAreaChange(null);
    }

    function handleMouseMove(event: L.LeafletMouseEvent) {
      const start = selectionStartRef.current;
      const rectangle = selectionRectangleRef.current;
      if (!exportSelectionEnabledRef.current || !start || !rectangle) {
        return;
      }

      rectangle.setBounds(L.latLngBounds(start, event.latlng));
    }

    function handleMouseUp(event: L.LeafletMouseEvent) {
      const start = selectionStartRef.current;
      const rectangle = selectionRectangleRef.current;
      if (!exportSelectionEnabledRef.current || !start || !rectangle) {
        return;
      }

      L.DomEvent.stop(event.originalEvent);
      selectionStartRef.current = null;
      const bounds = L.latLngBounds(start, event.latlng);
      rectangle.setBounds(bounds);
      onExportAreaChange(areaFromBounds(bounds, "selection"));
    }

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
    };
  }, [onExportAreaChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const activeIds = new Set(layers.filter((layer) => layer.tileUrlTemplate).map((layer) => layer.id));

    overlaysRef.current.forEach((overlay, layerId) => {
      if (!activeIds.has(layerId)) {
        overlay.removeFrom(map);
        overlaysRef.current.delete(layerId);
      }
    });

    layers.forEach((layer, index) => {
      if (!layer.tileUrlTemplate) {
        return;
      }

      let overlay = overlaysRef.current.get(layer.id);
      if (!overlay) {
        overlay = L.tileLayer(layer.tileUrlTemplate, {
          minZoom: 0,
          maxZoom: 22,
          tms: false,
          opacity: layer.opacity,
          zIndex: 200 + index,
        });
        overlaysRef.current.set(layer.id, overlay);
      }

      overlay.setOpacity(layer.opacity);
      overlay.setZIndex(200 + index);
      if (layer.visible && !map.hasLayer(overlay)) {
        overlay.addTo(map);
      }
      if (!layer.visible && map.hasLayer(overlay)) {
        overlay.removeFrom(map);
      }
    });
  }, [layers]);

  useEffect(() => {
    const group = markersRef.current;
    if (!group) {
      return;
    }

    group.clearLayers();
    layers.forEach((layer) => {
      layer.controlPoints.forEach((point) => {
        L.circleMarker([point.targetLatLng.lat, point.targetLatLng.lng], {
          radius: layer.id === selectedLayerId ? 7 : 5,
          color: layer.id === selectedLayerId ? "#f97316" : "#2563eb",
          weight: 2,
          fillColor: "#ffffff",
          fillOpacity: 0.95,
        })
          .bindTooltip(point.name, { direction: "top", offset: [0, -6] })
          .addTo(group);
      });
    });

    if (draftPoint) {
      L.circleMarker([draftPoint.lat, draftPoint.lng], {
        radius: 8,
        color: "#111827",
        weight: 2,
        dashArray: "4",
        fillColor: "#facc15",
        fillOpacity: 0.9,
      }).addTo(group);
    }
  }, [layers, selectedLayerId, draftPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLayerRequest) {
      return;
    }

    const layer = layers.find((candidate) => candidate.id === focusLayerRequest.layerId);
    const bounds = layer ? controlPointBounds(layer.controlPoints) : null;
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { maxZoom: 17, padding: [40, 40] });
    }
  }, [focusLayerRequest, layers]);

  return (
    <div className="map-view">
      <div className="pane-header map-header">
        <h2>Fond OpenStreetMap</h2>
        <span>{exportSelectionEnabled ? "Glissez pour definir la zone PDF" : "Cliquez pour placer le point cible"}</span>
      </div>
      <div className="leaflet-host" ref={containerRef} />
    </div>
  );
}
