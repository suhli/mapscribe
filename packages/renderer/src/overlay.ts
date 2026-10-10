import { isDrawnLine, type Layer, type LineGeometry, type LineStyle } from "@mapscribe/core";

export interface OverlaySource {
  id: string;
  data: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, never>;
      geometry: LineGeometry;
    }>;
  };
}

export interface OverlayLayer {
  id: string;
  type: "line";
  source: string;
  layout: Record<string, unknown>;
  paint: Record<string, unknown>;
}

export interface OverlaySpec {
  sources: OverlaySource[];
  layers: OverlayLayer[];
}

export interface GeoJsonSource {
  setData(data: OverlaySource["data"]): void;
}

export interface MapHandle {
  getSource(id: string): GeoJsonSource | undefined;
  getLayer(id: string): unknown;
  addSource(id: string, source: { type: "geojson"; data: OverlaySource["data"] }): void;
  addLayer(layer: OverlayLayer): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
  setPaintProperty(layer: string, name: string, value: unknown): void;
  setLayoutProperty(layer: string, name: string, value: unknown): void;
  moveLayer(id: string, beforeId?: string): void;
}

/** 线宽以项目中的参考缩放级别为基准，放大后变粗，避免缩放到街道级别后仍是一条发丝。 */
export function lineWidthExpression(style: LineStyle, fallbackZoom: number): number | unknown[] {
  if (style.widthMode === "screen") return style.width;
  const zoom = style.referenceZoom ?? fallbackZoom;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    Math.max(0, zoom - 5),
    Math.max(0.75, Number((style.width * 0.35).toFixed(2))),
    zoom,
    style.width,
    Math.min(22, zoom + 5),
    Number((style.width * 2.8).toFixed(2)),
  ];
}

function featureCollection(geometry: LineGeometry): OverlaySource["data"] {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry }],
  };
}

export function buildOverlay(layers: Layer[], selectedId: string | null, zoom: number, preview?: LineGeometry | null): OverlaySpec {
  const sources: OverlaySource[] = [];
  const overlayLayers: OverlayLayer[] = [];
  const visible = layers
    .filter(isDrawnLine)
    .filter((layer) => layer.visible)
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const layer of visible) {
    const sourceId = `ms-src-${layer.id}`;
    sources.push({ id: sourceId, data: featureCollection(layer.geometry) });
    const width = lineWidthExpression(layer.style, zoom);
    const selected = layer.id === selectedId;
    if (layer.style.outlineWidth > 0 || selected) {
      overlayLayers.push({
        id: `ms-outline-${layer.id}`,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": layer.style.lineCap,
          "line-join": layer.style.lineJoin,
        },
        paint: {
          "line-color": selected ? "#1d4ed8" : layer.style.outlineColor,
          "line-width": selected
            ? ["+", width, layer.style.outlineWidth * 2 + 4]
            : ["+", width, layer.style.outlineWidth * 2],
          "line-opacity": layer.style.opacity,
        },
      });
    }
    const paint: Record<string, unknown> = {
      "line-color": layer.style.color,
      "line-width": width,
      "line-opacity": layer.style.opacity,
    };
    if (layer.style.dash === "dashed") paint["line-dasharray"] = [2, 1.6];
    overlayLayers.push({
      id: `ms-line-${layer.id}`,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": layer.style.dash === "dashed" ? "butt" : layer.style.lineCap,
        "line-join": layer.style.lineJoin,
      },
      paint,
    });
  }

  if (preview && preview.coordinates.length > 0) {
    sources.push({ id: "ms-src-preview", data: featureCollection(preview) });
    overlayLayers.push({
      id: "ms-line-preview",
      type: "line",
      source: "ms-src-preview",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0284c7",
        "line-width": 5,
        "line-opacity": 0.85,
        "line-dasharray": [1.2, 1],
      },
    });
  }

  return { sources, layers: overlayLayers };
}

/** 把同一份覆盖物规格应用到 MapLibre，供编辑器和无头渲染共用。 */
export function createOverlayController(map: MapHandle) {
  const known = new Set<string>();

  return {
    sync(layers: Layer[], selectedId: string | null, zoom: number, preview?: LineGeometry | null): void {
      const spec = buildOverlay(layers, selectedId, zoom, preview);
      const next = new Set<string>();

      for (const source of spec.sources) {
        next.add(source.id);
        const existing = map.getSource(source.id);
        if (existing) existing.setData(source.data);
        else map.addSource(source.id, { type: "geojson", data: source.data });
      }

      for (const layer of spec.layers) {
        next.add(layer.id);
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer);
        } else {
          for (const [name, value] of Object.entries(layer.paint)) {
            map.setPaintProperty(layer.id, name, value);
          }
          for (const [name, value] of Object.entries(layer.layout)) {
            map.setLayoutProperty(layer.id, name, value);
          }
        }
      }

      for (const id of known) {
        if (next.has(id)) continue;
        if (id.startsWith("ms-line-") || id.startsWith("ms-outline-")) {
          if (map.getLayer(id)) map.removeLayer(id);
        } else if (id.startsWith("ms-src-")) {
          if (map.getSource(id)) map.removeSource(id);
        }
      }

      for (const layer of spec.layers) {
        if (map.getLayer(layer.id)) map.moveLayer(layer.id);
      }
      known.clear();
      for (const id of next) known.add(id);
    },
  };
}
