import { describe, expect, it } from "vitest";
import { createEmptyProject, createLabelLayer, createRoadLayer } from "@mapscribe/core";
import { buildOverlay, createOverlayController, lineWidthExpression } from "./overlay.js";
import { placeLabels } from "./labels.js";
import { resolveStyle } from "./style.js";
import { whenMapReady, type MapReadyTarget } from "./ready.js";
import type { MapHandle } from "./overlay.js";

describe("resolveStyle", () => {
  it("把 light 解析到无需密钥的 OpenFreeMap，并保留 OSM 署名", () => {
    const resolved = resolveStyle("light");
    expect(resolved.style).toBe("https://tiles.openfreemap.org/styles/positron");
    expect(resolved.attribution.join(" ")).toMatch(/OpenStreetMap/);
  });

  it("blank 样式不包含远程瓦片", () => {
    const resolved = resolveStyle("blank");
    expect(typeof resolved.style).toBe("object");
  });
});

describe("overlay", () => {
  it("为道路和预览各生成一条线，并让线宽跟随缩放", () => {
    const road = createRoadLayer({
      name: "测试",
      geometry: {
        type: "LineString",
        coordinates: [
          [104, 30],
          [104.01, 30.01],
        ],
      },
    });
    road.style.widthMode = "zoom";
    road.style.referenceZoom = 13;
    const expression = lineWidthExpression(road.style, 13);
    expect(Array.isArray(expression)).toBe(true);
    const spec = buildOverlay([road], road.id, 13, {
      type: "LineString",
      coordinates: [
        [104, 30],
        [104.02, 30.02],
      ],
    });
    expect(spec.sources.some((source) => source.id === `ms-src-${road.id}`)).toBe(true);
    expect(spec.layers.some((layer) => layer.id === "ms-line-preview")).toBe(true);
    expect(spec.layers.some((layer) => layer.id === `ms-outline-${road.id}`)).toBe(true);
  });

  it("同步时删除已经不存在的图层", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const sources = new Map<string, { setData: (data: unknown) => void }>();
    const layers = new Set<string>();
    const map: MapHandle = {
      getSource: (id) => sources.get(id),
      getLayer: (id) => (layers.has(id) ? {} : undefined),
      addSource: (id) => {
        sources.set(id, { setData: () => undefined });
      },
      addLayer: (layer) => {
        layers.add(layer.id);
        added.push(layer.id);
      },
      removeLayer: (id) => {
        layers.delete(id);
        removed.push(id);
      },
      removeSource: (id) => {
        sources.delete(id);
        removed.push(id);
      },
      setPaintProperty: () => undefined,
      setLayoutProperty: () => undefined,
      moveLayer: () => undefined,
    };
    const controller = createOverlayController(map);
    const road = createRoadLayer({
      name: "甲",
      geometry: {
        type: "LineString",
        coordinates: [
          [1, 1],
          [2, 2],
        ],
      },
    });
    controller.sync([road], null, 12);
    controller.sync([], null, 12);
    expect(added.length).toBeGreaterThan(0);
    expect(removed).toContain(`ms-line-${road.id}`);
  });
});

describe("placeLabels", () => {
  it("自动避让重叠标签，手动放置时保留偏移", () => {
    const first = createLabelLayer({ text: "甲", position: [104, 30] });
    const second = createLabelLayer({ text: "乙", position: [104, 30] });
    second.placement = "manual";
    second.offset = { x: 30, y: -10 };
    const placed = placeLabels([first, second], () => ({ x: 100, y: 100 }), () => ({ width: 40, height: 16 }));
    expect(placed).toHaveLength(2);
    expect((placed[1]?.box.x ?? 0) - (placed[0]?.box.x ?? 0)).toBe(30);
  });
});

describe("whenMapReady", () => {
  it("在地图空闲且瓦片加载完成后结束", async () => {
    const listeners = new Set<() => void>();
    let ready = false;
    const map: MapReadyTarget = {
      loaded: () => ready,
      isStyleLoaded: () => ready,
      areTilesLoaded: () => ready,
      on: (_event, listener) => {
        listeners.add(listener);
      },
      off: (_event, listener) => {
        listeners.delete(listener);
      },
    };
    const pending = whenMapReady(map, 1000);
    ready = true;
    for (const listener of listeners) listener();
    await pending;
  });

  it("超时时给出明确错误", async () => {
    const map: MapReadyTarget = {
      loaded: () => false,
      isStyleLoaded: () => false,
      areTilesLoaded: () => false,
      on: () => undefined,
      off: () => undefined,
    };
    await expect(whenMapReady(map, 20)).rejects.toThrow(/没有进入可渲染状态/);
  });
});

describe("createEmptyProject style", () => {
  it("默认项目可以被样式解析器接受", () => {
    const project = createEmptyProject();
    expect(resolveStyle(project.map.style).attribution.length).toBeGreaterThan(0);
  });
});
