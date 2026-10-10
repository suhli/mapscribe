import type { LineGeometry, LngLat, SourceQuery } from "@mapscribe/core";
import { MemoryCache } from "./cache.js";
import { toWgs84, type AxisOrderCrs } from "./crs.js";
import { haversineMeters } from "./coordinates.js";
import {
  buildGraph,
  clipWaysToRadius,
  connectedComponents,
  findJunctions,
  nodeKey,
  pathsBetween,
  pointInBounds,
  snapToGraph,
  snapToWays,
  traceNetwork,
  waysToGeometry,
  type Junction,
} from "./network.js";
import { ProviderRequestError, type GeocodeResult, type RoadWay, type RouteAlternative } from "./types.js";

export type ResolutionStatus = "resolved" | "ambiguous" | "not_found" | "provider_error" | "invalid_query";

export interface LocationScope {
  city?: string;
  bounds?: [number, number, number, number];
}

export interface ResolutionCandidate {
  id: string;
  name: string;
  area?: string;
  position?: LngLat;
  bounds?: [number, number, number, number];
  geometry?: LineGeometry;
  provider: string;
  featureId?: string;
  reason: string;
  match?: "exact" | "partial";
}

export interface ResolutionResult<T> {
  status: ResolutionStatus;
  value?: T;
  candidates: ResolutionCandidate[];
  warnings: string[];
  provider?: string;
  message: string;
}

export interface ResolvedPlace {
  name: string;
  position: LngLat;
  precision: "point" | "area" | "entrance" | "unknown";
  featureId?: string;
  bounds?: [number, number, number, number];
}

export interface ResolvedIntersection {
  name: string;
  position: LngLat;
  roads: [string, string];
  featureIds: string[];
}

export interface PlaceQuery {
  name: string;
  location?: LocationScope;
  precision?: "point" | "area" | "entrance";
  candidateId?: string;
}

export interface RoadQuery {
  name: string;
  location?: LocationScope;
  candidateId?: string;
}

export interface IntersectionQuery {
  roads: [string, string];
  location?: LocationScope;
  candidateId?: string;
}

export type AnchorQuery =
  | { type: "coordinate"; position: LngLat; crs?: AxisOrderCrs }
  | { type: "place"; name: string }
  | { type: "intersection"; road: string };

export interface RoadSegmentQuery {
  road: string;
  from: AnchorQuery;
  to: AnchorQuery;
  location?: LocationScope;
  candidateId?: string;
}

export interface NearbyRoadsQuery {
  center: { type: "place"; name: string } | { type: "coordinate"; position: LngLat; crs?: AxisOrderCrs } | { type: "intersection"; roads: [string, string] };
  radiusMeters?: number;
  mode?: "radius" | "along-road";
  location?: LocationScope;
  candidateId?: string;
}

export interface RouteQuery {
  from: AnchorQuery;
  to: AnchorQuery;
  location?: LocationScope;
  candidateId?: string;
}

export interface GeoResolver {
  resolvePlace(query: PlaceQuery): Promise<ResolutionResult<ResolvedPlace>>;
  resolveRoad(query: RoadQuery): Promise<ResolutionResult<LineGeometry>>;
  resolveIntersection(query: IntersectionQuery): Promise<ResolutionResult<ResolvedIntersection>>;
  resolveRoadSegment(query: RoadSegmentQuery): Promise<ResolutionResult<LineGeometry>>;
  resolveNearbyRoads(query: NearbyRoadsQuery): Promise<ResolutionResult<LineGeometry>>;
  resolveRoute(query: RouteQuery): Promise<ResolutionResult<LineGeometry>>;
}

/** 测试和 OSM 目录都实现这组查询。解析器不直接发 HTTP。 */
export interface GeoCatalog {
  searchPlaces(name: string, scope?: LocationScope): Promise<GeocodeResult[]>;
  searchRoads(name: string, scope?: LocationScope): Promise<RoadWay[]>;
  roadsNear(position: LngLat, radiusMeters: number): Promise<RoadWay[]>;
  route(start: LngLat, end: LngLat): Promise<RouteAlternative[]>;
}

const DEFAULT_RADIUS_METERS = 100;
const SNAP_METERS = 45;

export class AmbiguousScopeError extends Error {
  readonly hits: GeocodeResult[];

  constructor(hits: GeocodeResult[]) {
    super("城市或搜索范围有多个匹配，需要改用 bounds 或候选 id");
    this.name = "AmbiguousScopeError";
    this.hits = hits;
  }
}

export function createGeoResolver(catalog: GeoCatalog, options: { cache?: MemoryCache } = {}): GeoResolver {
  const cache = options.cache ?? new MemoryCache();

  async function cached<T>(key: string, run: () => Promise<ResolutionResult<T>>): Promise<ResolutionResult<T>> {
    const hit = cache.get<ResolutionResult<T>>(key);
    if (hit) return hit;
    const result = await run();
    if (result.status !== "provider_error") cache.set(key, result, 10 * 60 * 1000);
    return result;
  }

  return {
    resolvePlace: (query) => cached(`place:${JSON.stringify(query)}`, () => resolvePlace(catalog, query)),
    resolveRoad: (query) => cached(`road:${JSON.stringify(query)}`, () => resolveRoad(catalog, query)),
    resolveIntersection: (query) => cached(`xing:${JSON.stringify(query)}`, () => resolveIntersection(catalog, query)),
    resolveRoadSegment: (query) => cached(`segment:${JSON.stringify(query)}`, () => resolveRoadSegment(catalog, query)),
    resolveNearbyRoads: (query) => cached(`near:${JSON.stringify(query)}`, () => resolveNearby(catalog, query)),
    resolveRoute: (query) => cached(`route:${JSON.stringify(query)}`, () => resolveRoute(catalog, query)),
  };
}

export function sourceQueryToCall(query: SourceQuery): keyof GeoResolver {
  if (query.type === "place") return "resolvePlace";
  if (query.type === "road") return "resolveRoad";
  if (query.type === "intersection") return "resolveIntersection";
  if (query.type === "road-segment") return "resolveRoadSegment";
  if (query.type === "nearby-roads") return "resolveNearbyRoads";
  return "resolveRoute";
}

async function resolvePlace(catalog: GeoCatalog, query: PlaceQuery): Promise<ResolutionResult<ResolvedPlace>> {
  try {
    const hits = await catalog.searchPlaces(query.name, query.location);
    const candidates = hits.map((hit) => placeCandidate(hit));
    const chosen = choose(candidates, query.candidateId);
    if (chosen.status !== "resolved" || !chosen.value?.position) return passthrough(chosen, []);
    const hit = hits.find((item) => (item.id ?? item.label) === chosen.value?.id);
    const wanted = query.precision ?? "point";
    const actual = hit?.kind === "entrance" ? "entrance" : hit?.kind === "area" ? "area" : "point";
    const warnings: string[] = [];
    let precision: ResolvedPlace["precision"] = actual === "entrance" ? "entrance" : actual === "area" ? "area" : "point";
    if (wanted === "entrance" && precision !== "entrance") {
      precision = hit?.kind === "area" ? "area" : "point";
      warnings.push("没有找到入口坐标，当前结果是地点整体位置，不能当作入口");
    }
    return {
      status: "resolved",
      provider: "catalog",
      message: chosen.value.name,
      warnings,
      candidates,
      value: {
        name: chosen.value.name,
        position: chosen.value.position,
        precision,
        ...(chosen.value.featureId ? { featureId: chosen.value.featureId } : {}),
        ...(chosen.value.bounds ? { bounds: chosen.value.bounds } : {}),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

function placeCandidate(hit: GeocodeResult): ResolutionCandidate {
  return {
    id: hit.id ?? hit.label,
    name: hit.label,
    position: hit.position,
    ...(hit.bounds ? { bounds: hit.bounds } : {}),
    provider: "geocoder",
    ...(hit.id ? { featureId: hit.id } : {}),
    reason: hit.kind === "entrance" ? "地理编码结果带有入口标记" : "地理编码结果",
    ...(hit.kind ? {} : {}),
  };
}

async function resolveRoad(catalog: GeoCatalog, query: RoadQuery): Promise<ResolutionResult<LineGeometry>> {
  try {
    const grouped = await namedRoads(catalog, query.name, query.location);
    if (grouped.status !== "resolved" || !grouped.ways) return { ...grouped, candidates: grouped.candidates };
    const components = componentsOf(grouped.ways);
    const candidates = components.flatMap((ways) => {
      const candidate = roadCandidate(query.name, ways, "名称完全匹配的连通道路");
      return candidate ? [candidate] : [];
    });
    return geometryChoice(candidates, query.candidateId, grouped.warnings);
  } catch (error) {
    return failure(error);
  }
}

async function resolveIntersection(catalog: GeoCatalog, query: IntersectionQuery): Promise<ResolutionResult<ResolvedIntersection>> {
  try {
    if (normalize(query.roads[0]) === normalize(query.roads[1])) {
      return invalid("两条道路名称相同，无法确定交叉口");
    }
    const [left, right] = await Promise.all([
      namedRoads(catalog, query.roads[0], query.location),
      namedRoads(catalog, query.roads[1], query.location),
    ]);
    if (left.status !== "resolved" || !left.ways) return { status: left.status, message: left.message, warnings: left.warnings, candidates: left.candidates, provider: left.provider };
    if (right.status !== "resolved" || !right.ways) return { status: right.status, message: right.message, warnings: right.warnings, candidates: right.candidates, provider: right.provider };
    const junctions = findJunctions(left.ways, right.ways);
    const planar = junctions.filter((item) => !item.gradeSeparated);
    const separated = junctions.filter((item) => item.gradeSeparated);
    if (planar.length === 0) {
      return {
        status: "not_found",
        message: separated.length > 0 ? "只找到立体交叉，没有平面路口" : "这两条道路没有相交",
        warnings: separated.length > 0 ? ["高架、隧道或不同层级的交叉没有当成可通行路口"] : [],
        candidates: [],
        provider: "catalog",
      };
    }
    const candidates = planar.map((item) => junctionCandidate(query.roads, item));
    const chosen = choose(candidates, query.candidateId);
    if (chosen.status !== "resolved" || !chosen.value?.position) return passthrough(chosen, []);
    return {
      status: "resolved",
      message: chosen.value.name,
      warnings: [],
      candidates,
      provider: "catalog",
      value: {
        name: chosen.value.name,
        position: chosen.value.position,
        roads: query.roads,
        featureIds: chosen.value.featureId?.split(",") ?? [],
      },
    };
  } catch (error) {
    return failure(error);
  }
}

async function resolveRoadSegment(catalog: GeoCatalog, query: RoadSegmentQuery): Promise<ResolutionResult<LineGeometry>> {
  try {
    const named = await namedRoads(catalog, query.road, query.location);
    if (named.status !== "resolved" || !named.ways) return { ...named, candidates: named.candidates };
    const from = await anchorPoint(catalog, query.from, query.road, query.location);
    if (from.status !== "resolved" || !from.value) return { status: from.status, message: from.message, warnings: from.warnings, candidates: from.candidates, provider: from.provider };
    const to = await anchorPoint(catalog, query.to, query.road, query.location);
    if (to.status !== "resolved" || !to.value) return { status: to.status, message: to.message, warnings: to.warnings, candidates: to.candidates, provider: to.provider };
    if (haversineMeters(from.value, to.value) < 15) return invalid("路段两端太近，无法提取");
    const start = snapToWays(from.value, named.ways, SNAP_METERS);
    if (!start) return notFound("起点没有吸附到指定道路上");
    const end = snapToGraph(to.value, start.graph, SNAP_METERS);
    if (!end) return notFound("终点没有吸附到指定道路上");
    const startComponent = new Set(connectedComponents(end.graph).find((item) => item.includes(start.node)) ?? []);
    if (!startComponent.has(end.node)) return notFound("指定道路在这两点之间不连通");
    const paths = pathsBetween(end.graph, start.node, end.node);
    if (paths.length === 0) return notFound("指定道路在这两点之间不连通");
    const candidates = paths.map((geometry, index) => ({
      id: `segment:${query.road}:${index}:${nodeKey(geometry.coordinates[0] ?? from.value!)}`,
      name: query.road,
      geometry,
      provider: "catalog",
      featureId: named.ways?.map((way) => way.id).join(","),
      reason: index === 0 ? "沿该道路名称的几何提取" : "同一道路上还有另一条连通路径",
      match: "exact" as const,
    }));
    return geometryChoice(candidates, query.candidateId, ["路段来自道路几何，不是导航最短路"]);
  } catch (error) {
    return failure(error);
  }
}

async function resolveNearby(catalog: GeoCatalog, query: NearbyRoadsQuery): Promise<ResolutionResult<LineGeometry>> {
  try {
    const warnings: string[] = [];
    const radius = query.radiusMeters ?? DEFAULT_RADIUS_METERS;
    if (query.radiusMeters === undefined) warnings.push(`未提供范围，已使用默认 ${DEFAULT_RADIUS_METERS} 米`);
    const center = await nearbyCenter(catalog, query);
    if (center.status !== "resolved" || !center.value) return passthrough(center, [...warnings, ...center.warnings]);
    const mode = query.mode ?? "radius";
    const fetched = await catalog.roadsNear(center.value, mode === "along-road" ? Math.min(5000, radius * 3) : radius);
    const usable = fetched.filter((way) => way.geometry.coordinates.length >= 2 || way.geometry.type === "MultiLineString");
    if (usable.length === 0) return { ...notFound("范围内没有道路几何"), warnings };
    if (mode === "radius") {
      const geometry = clipWaysToRadius(usable, center.value, radius);
      if (!geometry) return { ...notFound("范围内没有可截取的道路"), warnings };
      return {
        status: "resolved",
        value: geometry,
        candidates: [{ id: "nearby:radius", name: `${radius} 米范围`, geometry, provider: "catalog", reason: "按空间半径截取道路" }],
        warnings,
        provider: "catalog",
        message: `已按 ${radius} 米半径截取道路`,
      };
    }
    const snap = snapToWays(center.value, usable, SNAP_METERS);
    if (!snap) return { ...notFound("中心点没有吸附到道路上"), warnings };
    const geometry = traceNetwork(snap.graph, snap.node, radius);
    if (!geometry) return { ...notFound("沿道路没有可截取的路段"), warnings };
    return {
      status: "resolved",
      value: geometry,
      candidates: [{ id: "nearby:along", name: `沿路 ${radius} 米`, geometry, provider: "catalog", reason: "按沿道路距离截取" }],
      warnings,
      provider: "catalog",
      message: `已沿道路截取 ${radius} 米`,
    };
  } catch (error) {
    return failure(error);
  }
}

async function resolveRoute(catalog: GeoCatalog, query: RouteQuery): Promise<ResolutionResult<LineGeometry>> {
  try {
    const from = await anchorPoint(catalog, query.from, "", query.location);
    if (from.status !== "resolved" || !from.value) return passthrough(from);
    const to = await anchorPoint(catalog, query.to, "", query.location);
    if (to.status !== "resolved" || !to.value) return passthrough(to);
    const routes = await catalog.route(from.value, to.value);
    if (routes.length === 0) return notFound("没有找到沿路网的路线");
    const candidates = routes.map((route, index) => ({
      id: `route:${index}:${Math.round(route.distanceMeters)}`,
      name: route.summary,
      geometry: route.geometry,
      provider: "routing",
      reason: "导航路网计算的路线，不是某一条道路的实体几何",
    }));
    return geometryChoice(candidates, query.candidateId, []);
  } catch (error) {
    return failure(error);
  }
}

async function nearbyCenter(catalog: GeoCatalog, query: NearbyRoadsQuery): Promise<ResolutionResult<LngLat>> {
  if (query.center.type === "coordinate") return coordinatePoint(query.center.position, query.center.crs, query.location?.bounds);
  if (query.center.type === "place") {
    const place = await resolvePlace(catalog, { name: query.center.name, ...(query.location ? { location: query.location } : {}) });
    if (place.status !== "resolved" || !place.value) return passthrough(place);
    return { status: "resolved", value: place.value.position, candidates: place.candidates, warnings: place.warnings, message: place.message };
  }
  const intersection = await resolveIntersection(catalog, { roads: query.center.roads, ...(query.location ? { location: query.location } : {}) });
  if (intersection.status !== "resolved" || !intersection.value) return passthrough(intersection);
  return { status: "resolved", value: intersection.value.position, candidates: intersection.candidates, warnings: intersection.warnings, message: intersection.message };
}

async function anchorPoint(catalog: GeoCatalog, anchor: AnchorQuery, road: string, scope?: LocationScope): Promise<ResolutionResult<LngLat>> {
  if (anchor.type === "coordinate") return coordinatePoint(anchor.position, anchor.crs, scope?.bounds);
  if (anchor.type === "place") {
    const place = await resolvePlace(catalog, { name: anchor.name, ...(scope ? { location: scope } : {}) });
    if (place.status !== "resolved" || !place.value) return passthrough(place);
    return { status: "resolved", value: place.value.position, candidates: [], warnings: place.warnings, message: place.message };
  }
  const intersection = await resolveIntersection(catalog, {
    roads: [road, anchor.road],
    ...(scope ? { location: scope } : {}),
  });
  if (intersection.status !== "resolved" || !intersection.value) return passthrough(intersection);
  return { status: "resolved", value: intersection.value.position, candidates: intersection.candidates, warnings: [], message: intersection.message };
}

function coordinatePoint(position: LngLat, crs: AxisOrderCrs | undefined, bounds?: [number, number, number, number]): ResolutionResult<LngLat> {
  const wgs = toWgs84(position, crs ?? "WGS84");
  if (bounds && !pointInBounds(wgs, bounds)) {
    return invalid("坐标不在搜索范围内。内部坐标使用 WGS84 的 [经度, 纬度]");
  }
  return { status: "resolved", value: wgs, candidates: [], warnings: crs && crs !== "WGS84" ? [`已把 ${crs} 坐标转换成 WGS84`] : [], message: "坐标" };
}

interface NamedRoads {
  status: ResolutionStatus;
  ways?: RoadWay[];
  candidates: ResolutionCandidate[];
  warnings: string[];
  message: string;
  provider?: string;
}

async function namedRoads(catalog: GeoCatalog, name: string, scope?: LocationScope): Promise<NamedRoads> {
  if (!scope?.city && !scope?.bounds) return { ...invalid("需要城市或搜索范围才能查询道路"), candidates: [] };
  const ways = (await catalog.searchRoads(name, scope)).filter(hasLine);
  const exact = ways.filter((way) => way.name && normalize(way.name) === normalize(name));
  const partial = ways.filter((way) => way.name && normalize(way.name) !== normalize(name) && normalize(way.name).includes(normalize(name)));
  if (exact.length === 0 && partial.length === 0) return { ...notFound(`没有找到「${name}」的道路几何`), candidates: [] };
  if (exact.length === 0) {
    const candidates = componentsOf(partial).flatMap((group) => {
      const candidate = roadCandidate(name, group, "名称只是部分匹配，需要确认");
      return candidate ? [candidate] : [];
    });
    return { status: "ambiguous", candidates, warnings: [], message: `「${name}」没有完全同名的道路`, provider: "catalog" };
  }
  const warnings = partial.length > 0 ? ["存在名称不完全相同的道路，例如辅路，没有自动并入"] : [];
  return { status: "resolved", ways: exact, candidates: [], warnings, message: name, provider: "catalog" };
}

function hasLine(way: RoadWay): boolean {
  return way.geometry.type === "MultiLineString" ? way.geometry.coordinates.some((line) => line.length >= 2) : way.geometry.coordinates.length >= 2;
}

function componentsOf(ways: RoadWay[]): RoadWay[][] {
  const graph = buildGraph(ways);
  const groups = connectedComponents(graph);
  return groups.map((nodes) => {
    const ids = new Set(graph.edges.filter((edge) => nodes.includes(edge.from)).map((edge) => edge.wayId));
    return ways.filter((way) => ids.has(way.id));
  }).filter((group) => group.length > 0);
}

function roadCandidate(name: string, ways: RoadWay[], reason: string): ResolutionCandidate | null {
  const geometry = waysToGeometry(ways);
  if (!geometry) return null;
  return {
    id: `road:${normalize(name)}:${ways.map((way) => way.id).sort().join("+")}`,
    name: ways[0]?.name ?? name,
    geometry,
    provider: "catalog",
    featureId: ways.map((way) => way.id).join(","),
    reason,
    match: ways.every((way) => way.name && normalize(way.name) === normalize(name)) ? "exact" : "partial",
  };
}

function junctionCandidate(roads: [string, string], junction: Junction): ResolutionCandidate {
  const id = `xing:${[...roads].sort().join("/")}@${junction.position[0].toFixed(5)},${junction.position[1].toFixed(5)}`;
  return {
    id,
    name: `${roads[0]} × ${roads[1]}`,
    position: junction.position,
    provider: "catalog",
    featureId: junction.wayIds.join(","),
    reason: "两条道路在同一层级相交或共点",
    match: "exact",
  };
}

function geometryChoice(candidates: ResolutionCandidate[], candidateId: string | undefined, warnings: string[]): ResolutionResult<LineGeometry> {
  const chosen = choose(candidates, candidateId);
  if (chosen.status !== "resolved" || !chosen.value?.geometry) return passthrough(chosen, warnings);
  return {
    status: "resolved",
    value: chosen.value.geometry,
    candidates,
    warnings,
    provider: chosen.value.provider,
    message: chosen.value.name,
  };
}

function choose<T extends ResolutionCandidate>(candidates: T[], candidateId?: string): ResolutionResult<T> {
  if (candidateId) {
    const match = candidates.find((item) => item.id === candidateId);
    if (!match) return { status: "invalid_query", message: "候选 id 不在结果中", warnings: [], candidates };
    return { status: "resolved", value: match, message: match.name, warnings: [], candidates, provider: match.provider };
  }
  if (candidates.length === 0) return notFound("没有匹配结果");
  if (candidates.length > 1) {
    return { status: "ambiguous", message: `有 ${candidates.length} 个候选，需要指定候选 id`, warnings: [], candidates };
  }
  const only = candidates[0];
  if (!only) return notFound("没有匹配结果");
  return { status: "resolved", value: only, message: only.name, warnings: [], candidates, provider: only.provider };
}

function passthrough<T>(result: ResolutionResult<unknown>, warnings = result.warnings): ResolutionResult<T> {
  return {
    status: result.status === "resolved" ? "not_found" : result.status,
    message: result.message,
    warnings,
    candidates: result.candidates,
    ...(result.provider ? { provider: result.provider } : {}),
  };
}

function invalid<T>(message: string): ResolutionResult<T> {
  return { status: "invalid_query", message, warnings: [], candidates: [] };
}

function notFound<T>(message: string): ResolutionResult<T> {
  return { status: "not_found", message, warnings: [], candidates: [] };
}

function failure<T>(error: unknown): ResolutionResult<T> {
  if (error instanceof AmbiguousScopeError) {
    return {
      status: "ambiguous",
      message: error.message,
      warnings: [],
      candidates: error.hits.map((hit) => ({
        id: hit.id ?? hit.label,
        name: hit.label,
        position: hit.position,
        ...(hit.bounds ? { bounds: hit.bounds } : {}),
        provider: "geocoder",
        ...(hit.id ? { featureId: hit.id } : {}),
        reason: "搜索范围存在多个匹配",
      })),
    };
  }
  const message = error instanceof Error ? error.message : "地理服务请求失败";
  if (error instanceof ProviderRequestError && message.includes("无法安全查询")) {
    return invalid(message);
  }
  return { status: "provider_error", message, warnings: [], candidates: [], provider: "catalog" };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}
