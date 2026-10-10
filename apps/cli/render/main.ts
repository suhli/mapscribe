import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/noto-sans-sc/latin-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "./style.css";
import { parseProject, type LabelLayer, type MapProject } from "@mapscribe/core";
import { boundsOfProject } from "@mapscribe/geo";
import {
  applyOutputBackground,
  createOverlayController,
  labelFont,
  measureLabel,
  paintAnnotations,
  placeLabels,
  resolveStyle,
  whenMapReady,
  type MapHandle,
  type MapReadyTarget,
} from "@mapscribe/renderer";

const initialState = (): RenderState => ({
  status: "idle",
  warnings: [],
  objects: [],
  fontLoaded: false,
  labelInkPixels: 0,
  attribution: [],
});

window.__mapscribeState = initialState();

let exportCanvas: HTMLCanvasElement | undefined;
let mime = "image/png";
let quality = 0.92;

window.__mapscribe = {
  async render(input: unknown): Promise<void> {
    window.__mapscribeState = { ...initialState(), status: "pending" };
    try {
      const parsed = parseProject(input);
      await renderProject(parsed.project, parsed.warnings);
      window.__mapscribeState = { ...window.__mapscribeState, status: "ready" };
    } catch (error) {
      window.__mapscribeState = {
        ...window.__mapscribeState,
        status: "error",
        message: error instanceof Error ? error.message : "渲染失败",
      };
    }
  },
  exportDataUrl(): string {
    if (!exportCanvas) throw new Error("地图尚未渲染完成");
    return exportCanvas.toDataURL(mime, quality);
  },
};

async function renderProject(project: MapProject, warnings: string[]): Promise<void> {
  const cssWidth = project.output.width / project.output.pixelRatio;
  const cssHeight = project.output.height / project.output.pixelRatio;
  const container = document.querySelector<HTMLElement>("#map");
  if (!container) throw new Error("缺少地图容器");
  document.documentElement.style.width = `${cssWidth}px`;
  document.documentElement.style.height = `${cssHeight}px`;
  container.style.width = `${cssWidth}px`;
  container.style.height = `${cssHeight}px`;

  const resolved = applyOutputBackground(
    resolveStyle(project.map.style, project.map.attribution ?? []),
    project.output.background,
  );
  warnings.push(...resolved.warnings);
  if (project.output.format === "jpeg" && project.output.background === "transparent") {
    warnings.push("JPEG 不支持透明背景，已使用白色");
  }

  const map = new maplibregl.Map({
    container,
    style: resolved.style as maplibregl.StyleSpecification | string,
    center: project.map.center,
    zoom: project.map.zoom,
    bearing: project.map.bearing,
    pitch: project.map.pitch,
    pixelRatio: project.output.pixelRatio,
    interactive: false,
    fadeDuration: 0,
    attributionControl: false,
    canvasContextAttributes: {
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: project.output.background === "transparent",
    },
  });

  const mapErrors: string[] = [];
  map.on("error", (event) => {
    mapErrors.push(event.error?.message ?? "地图错误");
  });

  try {
    const readyTarget = mapReadyTarget(map);
    await whenMapReady(readyTarget);
    const overlay = createOverlayController(mapHandle(map));
    overlay.sync(project.layers, null, project.map.zoom);
    if (project.output.fit === "content") {
      const bounds = boundsOfProject(project);
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: project.output.padding, animate: false },
        );
        overlay.sync(project.layers, null, map.getZoom());
      }
    }
    await whenMapReady(readyTarget);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const labels = project.layers.filter((layer): layer is LabelLayer => layer.type === "label" && layer.visible);
    const sample = labels.map((label) => label.text).join("") || "中文";
    await document.fonts.load(labelFont(24), sample);
    await document.fonts.ready;
    const fontLoaded = document.fonts.check(labelFont(24));
    const needsCjk = [...sample].some((char) => char.charCodeAt(0) > 255);
    if (needsCjk && !fontLoaded) {
      throw new Error("中文字体 Noto Sans SC 未加载，标签会变成方框");
    }

    const mapCanvas = map.getCanvas();
    const canvas = document.createElement("canvas");
    canvas.width = mapCanvas.width;
    canvas.height = mapCanvas.height;
    const context = canvas.getContext("2d", { alpha: true });
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
      (position) => {
        const point = map.project(position);
        return { x: point.x, y: point.y };
      },
      (text, fontSize, icon) => measureLabel(measureContext, text, fontSize, icon),
    );
    const painted = paintAnnotations(context, placed, resolved.attribution, project.output.pixelRatio);
    exportCanvas = canvas;
    mime = project.output.format === "jpeg" ? "image/jpeg" : project.output.format === "webp" ? "image/webp" : "image/png";
    quality = project.output.quality;

    window.__mapscribeState = {
      status: "pending",
      warnings,
      width: canvas.width,
      height: canvas.height,
      objects: project.layers.filter((layer) => layer.visible).map((layer) => ({ id: layer.id, type: layer.type })),
      fontLoaded,
      labelInkPixels: painted.labelInkPixels,
      attribution: resolved.attribution,
    };
  } catch (error) {
    const detail = mapErrors.length ? ` ${mapErrors.slice(-3).join("；")}` : "";
    throw new Error(`${error instanceof Error ? error.message : "渲染失败"}${detail}`);
  } finally {
    map.remove();
  }
}

function mapReadyTarget(map: maplibregl.Map): MapReadyTarget {
  return {
    loaded: () => map.loaded(),
    isStyleLoaded: () => Boolean(map.isStyleLoaded()),
    areTilesLoaded: () => map.areTilesLoaded(),
    on: (_event, listener) => {
      map.on("idle", listener);
    },
    off: (_event, listener) => {
      map.off("idle", listener);
    },
  };
}

function mapHandle(map: maplibregl.Map): MapHandle {
  return {
    getSource: (id) => {
      const source = map.getSource(id);
      if (source && "setData" in source && typeof source.setData === "function") {
        const setData = source.setData as (data: never) => void;
        return { setData: (data) => setData(data as never) };
      }
      return undefined;
    },
    getLayer: (id) => map.getLayer(id),
    addSource: (id, source) => {
      map.addSource(id, source as maplibregl.GeoJSONSourceSpecification);
    },
    addLayer: (layer) => {
      map.addLayer(layer as maplibregl.AddLayerObject);
    },
    removeLayer: (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
    removeSource: (id) => {
      if (map.getSource(id)) map.removeSource(id);
    },
    setPaintProperty: (layer, name, value) => {
      map.setPaintProperty(layer, name, value as never);
    },
    setLayoutProperty: (layer, name, value) => {
      map.setLayoutProperty(layer, name, value as never);
    },
    moveLayer: (id) => {
      if (map.getLayer(id)) map.moveLayer(id);
    },
  };
}
