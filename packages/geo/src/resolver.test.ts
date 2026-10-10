import { describe, expect, it } from "vitest";
import { createEmptyProject, parseProject } from "@mapscribe/core";
import { gcj02ToWgs84, wgs84ToGcj02 } from "./crs.js";
import { haversineMeters } from "./coordinates.js";
import { resolveProject } from "./resolve-project.js";
import { chooseAreaBounds, createGeoResolver, type GeoCatalog, type ResolutionResult } from "./resolver.js";
import { ProviderRequestError, type GeocodeResult, type RoadWay, type RouteAlternative } from "./types.js";

const scope = { city: "测试市", bounds: [104, 30.6, 104.3, 30.9] as [number, number, number, number] };

function way(id: string, name: string, coordinates: [number, number][], extra: Partial<RoadWay> = {}): RoadWay {
  return { id, name, highway: "primary", geometry: { type: "LineString", coordinates }, ...extra };
}

const network: RoadWay[] = [
  way("way/1", "甲路", [[104.06, 30.66], [104.07, 30.66], [104.08, 30.66]]),
  way("way/2", "乙路", [[104.07, 30.65], [104.07, 30.66], [104.07, 30.67]]),
  way("way/7", "乙路", [[104.072, 30.65], [104.072, 30.67]]),
  way("way/3", "丙路", [[104.09, 30.65], [104.09, 30.67]]),
  way("way/4", "高架路", [[104.065, 30.655], [104.075, 30.665]], { bridge: true, layer: 1 }),
  way("way/5", "甲路", [[104.2, 30.8], [104.22, 30.8]]),
  way("way/6", "甲路辅路", [[104.06, 30.661], [104.08, 30.661]]),
  way("way/8", "断路", [[104.06, 30.7], [104.065, 30.7]]),
  way("way/9", "断路", [[104.075, 30.7], [104.08, 30.7]]),
  way("way/10", "丁路", [[104.065, 30.65], [104.065, 30.67]]),
  way("way/11", "戊路", [[104.075, 30.65], [104.075, 30.67]]),
  way("way/12", "残路", [[104.1, 30.7]], ),
];

const places: GeocodeResult[] = [
  { id: "node/1", label: "测试商场", position: [104.07, 30.66], kind: "poi" },
  { id: "node/2", label: "测试入口", position: [104.071, 30.661], kind: "entrance" },
  { id: "node/3", label: "同名地点甲", position: [104.08, 30.66], kind: "poi" },
  { id: "node/4", label: "同名地点乙", position: [104.2, 30.8], kind: "poi" },
];

function catalog(options: { fail?: "roads" | "timeout"; routeCalls?: { count: number } } = {}): GeoCatalog {
  return {
    async searchPlaces(name) {
      return places.filter((item) => item.label.includes(name));
    },
    async searchRoads(name) {
      if (options.fail === "roads") throw new ProviderRequestError("服务返回 500", 500);
      if (options.fail === "timeout") throw new ProviderRequestError("请求超时");
      return network.filter((item) => item.name?.includes(name));
    },
    async roadsNear(position, radiusMeters) {
      return network.filter((item) => {
        const line = item.geometry.type === "LineString" ? item.geometry.coordinates : [];
        return line.some((point) => haversineMeters(position, point) <= radiusMeters);
      });
    },
    async route(start, end): Promise<RouteAlternative[]> {
      if (options.routeCalls) options.routeCalls.count += 1;
      return [
        {
          geometry: { type: "LineString", coordinates: [start, [104.07, 30.665], end] },
          distanceMeters: 800,
          durationSeconds: 120,
          summary: "测试路线 0.8 km",
        },
        {
          geometry: { type: "LineString", coordinates: [start, [104.09, 30.67], end] },
          distanceMeters: 1400,
          durationSeconds: 200,
          summary: "测试路线 1.4 km",
        },
      ];
    },
  };
}

function lineOf(result: ResolutionResult<{ type: string; coordinates: unknown }>): [number, number][] {
  const geometry = result.value as { type: string; coordinates: [number, number][] | [number, number][][] } | undefined;
  if (!geometry) return [];
  return geometry.type === "LineString" ? (geometry.coordinates as [number, number][]) : [];
}

describe("GeoResolver", () => {
  it("定位普通地点，并在要求入口时说明这不是入口", async () => {
    const resolver = createGeoResolver(catalog());
    const place = await resolver.resolvePlace({ name: "测试商场", location: scope });
    expect(place.status).toBe("resolved");
    expect(place.value?.position).toEqual([104.07, 30.66]);
    const entrance = await resolver.resolvePlace({ name: "测试商场", location: scope, precision: "entrance" });
    expect(entrance.value?.precision).not.toBe("entrance");
    expect(entrance.warnings.join("")).toContain("不能当作入口");
    const door = await resolver.resolvePlace({ name: "测试入口", location: scope, precision: "entrance" });
    expect(door.value?.precision).toBe("entrance");
  });

  it("同名地点返回候选，不自动挑一个", async () => {
    const result = await createGeoResolver(catalog()).resolvePlace({ name: "同名地点", location: scope });
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
    expect(result.value).toBeUndefined();
  });

  it("解析唯一平面交叉口，并拒绝不相交、高架和多个交叉口", async () => {
    const resolver = createGeoResolver(catalog());
    const unique = await resolver.resolveIntersection({ roads: ["甲路", "丁路"], location: scope });
    expect(unique.status).toBe("resolved");
    expect(unique.value?.position[0]).toBeCloseTo(104.065, 3);
    expect(unique.value?.position[1]).toBeCloseTo(30.66, 3);

    const missing = await resolver.resolveIntersection({ roads: ["甲路", "丙路"], location: scope });
    expect(missing.status).toBe("not_found");

    const bridge = await resolver.resolveIntersection({ roads: ["甲路", "高架路"], location: scope });
    expect(bridge.status).toBe("not_found");
    expect(bridge.message).toContain("立体");

    const many = await resolver.resolveIntersection({ roads: ["甲路", "乙路"], location: scope });
    expect(many.status).toBe("ambiguous");
    const picked = await resolver.resolveIntersection({
      roads: ["甲路", "乙路"],
      location: scope,
      candidateId: many.candidates[0]?.id,
    });
    expect(picked.status).toBe("resolved");
  });

  it("沿指定道路提取两个路口之间的几何，并且不调用导航", async () => {
    const routeCalls = { count: 0 };
    const resolver = createGeoResolver(catalog({ routeCalls }));
    const result = await resolver.resolveRoadSegment({
      road: "甲路",
      from: { type: "intersection", road: "丁路" },
      to: { type: "intersection", road: "戊路" },
      location: scope,
    });
    expect(result.status).toBe("resolved");
    expect(routeCalls.count).toBe(0);
    const coordinates = lineOf(result);
    expect(coordinates.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...coordinates.map((point) => point[0]))).toBeGreaterThan(104.064);
    expect(Math.max(...coordinates.map((point) => point[0]))).toBeLessThan(104.076);
    expect(coordinates.every((point) => Math.abs(point[1] - 30.66) < 0.0001)).toBe(true);
    const snapped = await resolver.resolveRoadSegment({
      road: "甲路",
      from: { type: "coordinate", position: [104.066, 30.6602] },
      to: { type: "coordinate", position: [104.074, 30.6602] },
      location: scope,
    });
    expect(snapped.status).toBe("resolved");
    expect(lineOf(snapped).every((point) => Math.abs(point[1] - 30.66) < 0.0001)).toBe(true);
  });

  it("同名道路、不连通路段和不完整几何会明确失败", async () => {
    const resolver = createGeoResolver(catalog());
    const sameName = await resolver.resolveRoad({ name: "甲路", location: scope });
    expect(sameName.status).toBe("ambiguous");
    expect(sameName.warnings.join("")).toContain("辅路");
    const broken = await resolver.resolveRoadSegment({
      road: "断路",
      from: { type: "coordinate", position: [104.062, 30.7] },
      to: { type: "coordinate", position: [104.078, 30.7] },
      location: scope,
    });
    expect(broken.status).toBe("not_found");
    expect(broken.message).toContain("不连通");
    const incomplete = await resolver.resolveRoad({ name: "残路", location: scope });
    expect(incomplete.status).toBe("not_found");
  });

  it("服务超时、没有结果，以及范围外的坐标都不会生成几何", async () => {
    const timeout = await createGeoResolver(catalog({ fail: "timeout" })).resolveRoad({ name: "甲路", location: scope });
    expect(timeout.status).toBe("provider_error");
    expect(timeout.value).toBeUndefined();
    const empty = await createGeoResolver(catalog()).resolveRoad({ name: "不存在路", location: scope });
    expect(empty.status).toBe("not_found");
    const outside = await createGeoResolver(catalog()).resolveRoadSegment({
      road: "甲路",
      from: { type: "coordinate", position: [10, 10] },
      to: { type: "coordinate", position: [104.07, 30.66] },
      location: scope,
    });
    expect(outside.status).toBe("invalid_query");
    expect(outside.message).toContain("经度");
  });

  it("导航路线和道路路段是两种结果，多条路线保持歧义", async () => {
    const result = await createGeoResolver(catalog()).resolveRoute({
      from: { type: "place", name: "测试商场" },
      to: { type: "place", name: "测试入口" },
      location: scope,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.candidates[0]?.reason).toContain("导航");
  });

  it("附近道路记录默认半径，已保存几何不会再次查询", async () => {
    const nearby = await createGeoResolver(catalog()).resolveNearbyRoads({
      center: { type: "coordinate", position: [104.07, 30.66] },
      location: scope,
      mode: "radius",
    });
    expect(nearby.status).toBe("resolved");
    expect(nearby.warnings.join("")).toContain("100");

    let calls = 0;
    const resolver = createGeoResolver({
      ...catalog(),
      async searchRoads() {
        calls += 1;
        return [];
      },
    });
    const project = parseProject({
      ...createEmptyProject(),
      layers: [
        {
          id: "road-1",
          type: "road-highlight",
          sourceQuery: { type: "road", road: "甲路", location: scope },
          geometry: { type: "LineString", coordinates: [[104.06, 30.66], [104.08, 30.66]] },
          resolution: { status: "resolved", warnings: [] },
        },
      ],
    }).project;
    const again = await resolveProject(project, resolver);
    expect(again.ok).toBe(true);
    expect(calls).toBe(0);
    const forced = await resolveProject(project, resolver, { force: true });
    expect(forced.ok).toBe(false);
    expect(calls).toBe(1);
    expect(forced.project.layers[0]?.type === "road-highlight" ? forced.project.layers[0].geometry : undefined).toBeDefined();
  });

  it("同一解析器重复执行得到相同几何", async () => {
    const resolver = createGeoResolver(catalog());
    const query = { roads: ["甲路", "丁路"] as [string, string], location: scope };
    const first = await resolver.resolveIntersection(query);
    const second = await resolver.resolveIntersection(query);
    expect(second).toEqual(first);
  });

  it("同名城市不会自动挑选，选中其中一个后使用它的范围", () => {
    const hits: GeocodeResult[] = [
      {
        id: "relation/1",
        label: "广州市，广东省，中国",
        position: [113.26, 23.13],
        bounds: [112.9, 22.5, 113.7, 23.9],
        kind: "area",
      },
      {
        id: "relation/2",
        label: "廣州市，京畿道，韩国",
        position: [127.02, 37.26],
        bounds: [126.6, 37.1, 127.5, 37.5],
        kind: "area",
      },
    ];
    expect(chooseAreaBounds(hits)).toEqual({ ambiguous: hits });
    expect(chooseAreaBounds(hits, "relation/1")).toEqual({ bounds: [112.9, 22.5, 113.7, 23.9] });
  });

  it("GCJ-02 与 WGS84 可以来回转换，中国范围外保持不变", () => {
    const wgs: [number, number] = [104.0658, 30.6574];
    const gcj = wgs84ToGcj02(wgs);
    expect(haversineMeters(wgs, gcj)).toBeGreaterThan(10);
    expect(haversineMeters(wgs, gcj02ToWgs84(gcj))).toBeLessThan(2);
    expect(wgs84ToGcj02([10, 10])).toEqual([10, 10]);
  });
});
