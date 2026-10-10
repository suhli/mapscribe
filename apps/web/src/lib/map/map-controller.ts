import maplibregl, { type Map as MapLibreMap, type MapGeoJSONFeature } from "maplibre-gl";
import type { LabelLayer, Layer, LineGeometry, LngLat, MapProject, MapStyle } from "@mapscribe/core";
import { isLineLayer } from "@mapscribe/core";
import { boundsOfLayer, boundsOfProject } from "@mapscribe/geo";
import {
  createOverlayController,
  labelFont,
  measureLabel,
  paintAnnotations,
  placeLabels,
  resolveStyle,
  whenMapReady,
  type MapHandle,
} from "@mapscribe/renderer";
import { DrawTool } from "./draw-tool";

export interface RenderedRoad {
  name: string | null;
  detail: string | null;
  geometry: LineGeometry;
}

export interface MapControllerHooks {
  getTool: () => string;
  onView: (view: { center: LngLat; zoom: number; bearing: number; pitch: number }) => void;
  onClick: (position: LngLat) => void;
  onDrawFinish: (coordinates: LngLat[]) => void;
  onError: (message: string) => void;
}

const ROAD_CLASSES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "minor",
  "service",
  "street",
  "path",
  "track",
  "residential",
  "unclassified",
  "living_street",
  "pedestrian",
]);

export class MapController {
  readonly map: MapLibreMap;
  private readonly overlay: ReturnType<typeof createOverlayController>;
  private readonly draw: DrawTool;
  private styleKey = "";
  private ignoreView = false;

  constructor(
    container: HTMLElement,
    project: MapProject,
    private readonly hooks: MapControllerHooks,
  ) {
    const resolved = resolveStyle(project.map.style, project.map.attribution ?? []);
    this.styleKey = JSON.stringify(project.map.style);
    this.map = new maplibregl.Map({
      container,
      style: resolved.style as maplibregl.StyleSpecification | string,
      center: project.map.center,
      zoom: project.map.zoom,
      bearing: project.map.bearing,
      pitch: project.map.pitch,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    this.overlay = createOverlayController(this.asHandle());
    this.draw = new DrawTool(this.map, hooks.onDrawFinish);
    this.map.on("load", () => {
      this.draw.start();
      this.sync(project, null, null);
      container.dataset.ready = "true";
    });
    this.map.on("moveend", () => {
      if (this.ignoreView) return;
      hooks.onView(this.getView());
    });
    this.map.on("click", (event) => {
      if (this.hooks.getTool() === "draw") return;
      this.hooks.onClick([event.lngLat.lng, event.lngLat.lat]);
    });
    this.map.on("error", (event) => {
      const message = event.error?.message ?? "";
      if (/failed to fetch|ajaxerror|style/i.test(message)) this.hooks.onError(message);
    });
  }

  destroy(): void {
    this.draw.stop();
    this.map.remove();
  }

  resize(): void {
    this.map.resize();
  }

  getView(): { center: LngLat; zoom: number; bearing: number; pitch: number } {
    const center = this.map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  project(position: LngLat): { x: number; y: number } {
    const point = this.map.project(position);
    return { x: point.x, y: point.y };
  }

  unproject(point: { x: number; y: number }): LngLat {
    const lngLat = this.map.unproject([point.x, point.y]);
    return [lngLat.lng, lngLat.lat];
  }

  setDragPan(enabled: boolean): void {
    if (enabled) this.map.dragPan.enable();
    else this.map.dragPan.disable();
  }

  sync(project: MapProject, selectedId: string | null, preview: LineGeometry | null): void {
    if (!this.map.isStyleLoaded()) return;
    this.overlay.sync(project.layers, selectedId, this.map.getZoom(), preview);
  }

  async setBasemap(style: MapStyle, attribution: string[] = []): Promise<void> {
    const key = JSON.stringify(style);
    if (key === this.styleKey) return;
    this.styleKey = key;
    const resolved = resolveStyle(style, attribution);
    this.draw.stop();
    this.map.setStyle(resolved.style as maplibregl.StyleSpecification | string);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("底图样式加载超时")), 20_000);
      this.map.once("style.load", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.draw.start();
  }

  setDrawActive(active: boolean): void {
    if (!this.map.isStyleLoaded()) return;
    this.draw.setActive(active);
  }

  cancelDraw(): void {
    this.draw.cancel();
  }

  focus(position: LngLat, zoom = this.map.getZoom()): void {
    this.ignoreView = true;
    this.map.easeTo({ center: position, zoom, duration: 400 });
    window.setTimeout(() => {
      this.ignoreView = false;
    }, 450);
  }

  fitBounds(bounds: [number, number, number, number]): void {
    this.map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 56, duration: 450, maxZoom: 17 },
    );
  }

  fitLayer(layer: Layer): void {
    const bounds = boundsOfLayer(layer);
    if (!bounds) return;
    if (bounds[0] === bounds[2] && bounds[1] === bounds[3]) this.focus([bounds[0], bounds[1]], Math.max(this.map.getZoom(), 16));
    else this.fitBounds(bounds);
  }

  fitProject(project: MapProject): void {
    const bounds = boundsOfProject(project);
    if (bounds) this.fitBounds(bounds);
  }

  queryOwnLayer(position: LngLat): string | null {
    const point = this.map.project(position);
    const features = this.map.queryRenderedFeatures([
      [point.x - 8, point.y - 8],
      [point.x + 8, point.y + 8],
    ]);
    for (const feature of features) {
      const layerId = feature.layer.id;
      if (layerId.startsWith("ms-line-") && layerId !== "ms-line-preview") return layerId.slice("ms-line-".length);
    }
    return null;
  }

  queryRenderedRoads(position: LngLat): RenderedRoad[] {
    const point = this.map.project(position);
    const features = this.map.queryRenderedFeatures([
      [point.x - 8, point.y - 8],
      [point.x + 8, point.y + 8],
    ]);
    const roads: RenderedRoad[] = [];
    const seen = new Set<string>();
    for (const feature of features) {
      if (!isBasemapRoad(feature)) continue;
      const geometry = toLineGeometry(feature);
      if (!geometry) continue;
      const name = stringProp(feature.properties, "name") ?? stringProp(feature.properties, "name_zh");
      const detail = stringProp(feature.properties, "class") ?? stringProp(feature.properties, "highway");
      const key = `${name ?? ""}:${geometry.coordinates.length}:${geometry.coordinates[0]?.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      roads.push({ name, detail, geometry });
    }
    return roads;
  }

  async exportImage(project: MapProject, selectedId: string | null): Promise<Blob> {
    const container = this.map.getContainer();
    const previousCss = { width: container.style.width, height: container.style.height };
    const previous = this.getView();
    const cssWidth = project.output.width / project.output.pixelRatio;
    const cssHeight = project.output.height / project.output.pixelRatio;
    try {
      container.style.width = `${cssWidth}px`;
      container.style.height = `${cssHeight}px`;
      this.map.setPixelRatio(project.output.pixelRatio);
      this.map.resize();
      if (project.output.fit === "content") {
        const bounds = boundsOfProject(project);
        if (bounds) {
          this.map.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { padding: project.output.padding, animate: false },
          );
        }
      }
      this.sync(project, null, null);
      await whenMapReady({
        loaded: () => this.map.loaded(),
        isStyleLoaded: () => Boolean(this.map.isStyleLoaded()),
        areTilesLoaded: () => this.map.areTilesLoaded(),
        on: (_event, listener) => {
          this.map.on("idle", listener);
        },
        off: (_event, listener) => {
          this.map.off("idle", listener);
        },
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const labels = project.layers.filter((layer): layer is LabelLayer => layer.type === "label" && layer.visible);
      const sample = labels.map((label) => label.text).join("") || "中文";
      await document.fonts.load(labelFont(24), sample);
      const mapCanvas = this.map.getCanvas();
      const canvas = document.createElement("canvas");
      canvas.width = mapCanvas.width;
      canvas.height = mapCanvas.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建导出画布");
      if (project.output.background !== "transparent") {
        context.fillStyle = project.output.format === "jpeg" ? "#ffffff" : project.output.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(mapCanvas, 0, 0);
      const measureContext = document.createElement("canvas").getContext("2d");
      if (!measureContext) throw new Error("无法测量标签");
      const placed = placeLabels(
        labels,
        (position) => this.project(position),
        (text, fontSize, icon) => measureLabel(measureContext, text, fontSize, icon),
      );
      const attribution = resolveStyle(project.map.style, project.map.attribution ?? []).attribution;
      paintAnnotations(context, placed, attribution, project.output.pixelRatio);
      const mime = project.output.format === "jpeg" ? "image/jpeg" : project.output.format === "webp" ? "image/webp" : "image/png";
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("浏览器没有生成图片"))),
          mime,
          project.output.quality,
        );
      });
      return blob;
    } finally {
      container.style.width = previousCss.width;
      container.style.height = previousCss.height;
      this.map.setPixelRatio(window.devicePixelRatio);
      this.map.resize();
      this.map.jumpTo({
        center: previous.center,
        zoom: previous.zoom,
        bearing: previous.bearing,
        pitch: previous.pitch,
      });
      this.sync(project, selectedId, null);
    }
  }

  consumesView(): boolean {
    return this.ignoreView;
  }

  private asHandle(): MapHandle {
    return {
      getSource: (id) => {
        const source = this.map.getSource(id);
        if (source && "setData" in source && typeof source.setData === "function") {
          const setData = source.setData as (data: never) => void;
          return { setData: (data) => setData(data as never) };
        }
        return undefined;
      },
      getLayer: (id) => this.map.getLayer(id),
      addSource: (id, source) => {
        this.map.addSource(id, source as maplibregl.GeoJSONSourceSpecification);
      },
      addLayer: (layer) => {
        this.map.addLayer(layer as maplibregl.AddLayerObject);
      },
      removeLayer: (id) => {
        if (this.map.getLayer(id)) this.map.removeLayer(id);
      },
      removeSource: (id) => {
        if (this.map.getSource(id)) this.map.removeSource(id);
      },
      setPaintProperty: (layer, name, value) => {
        this.map.setPaintProperty(layer, name, value as never);
      },
      setLayoutProperty: (layer, name, value) => {
        this.map.setLayoutProperty(layer, name, value as never);
      },
      moveLayer: (id) => {
        if (this.map.getLayer(id)) this.map.moveLayer(id);
      },
    };
  }
}

function isBasemapRoad(feature: MapGeoJSONFeature): boolean {
  const layerId = feature.layer.id;
  if (layerId.startsWith("ms-") || layerId.includes("terra-draw")) return false;
  const geometry = feature.geometry.type;
  if (geometry !== "LineString" && geometry !== "MultiLineString") return false;
  const sourceLayer = feature.sourceLayer ?? "";
  if (sourceLayer === "transportation" || sourceLayer.includes("road") || sourceLayer.includes("transport")) return true;
  const roadClass = stringProp(feature.properties, "class") ?? stringProp(feature.properties, "highway");
  return roadClass ? ROAD_CLASSES.has(roadClass) : false;
}

function toLineGeometry(feature: MapGeoJSONFeature): LineGeometry | null {
  if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
    return feature.geometry as LineGeometry;
  }
  return null;
}

function stringProp(properties: MapGeoJSONFeature["properties"], key: string): string | null {
  const value = properties?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function lineLayers(project: MapProject): Layer[] {
  return project.layers.filter(isLineLayer);
}
