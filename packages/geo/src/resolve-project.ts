import {
  isDrawnLine,
  isPlacedLabel,
  type Layer,
  type LineGeometry,
  type MapProject,
  type ResolutionRecord,
  type SourceInfo,
  type SourceQuery,
} from "@mapscribe/core";
import { NominatimGeocoder } from "./nominatim.js";
import { OsrmRoutingProvider } from "./osrm.js";
import { OverpassRoadProvider } from "./overpass.js";
import {
  AmbiguousScopeError,
  chooseAreaBounds,
  createGeoResolver,
  type AnchorQuery,
  type GeoCatalog,
  type GeoResolver,
  type ResolutionCandidate,
  type ResolutionResult,
  type ResolutionStatus,
  type ResolvedIntersection,
  type ResolvedPlace,
} from "./resolver.js";

export interface LayerResolutionReport {
  id: string;
  status: ResolutionStatus | "skipped";
  message: string;
  warnings: string[];
  candidates: ResolutionCandidate[];
}

export interface ProjectResolution {
  ok: boolean;
  project: MapProject;
  reports: LayerResolutionReport[];
}

export function projectNeedsResolution(project: MapProject, force = false): boolean {
  return project.layers.some((layer) => layerNeedsResolution(layer, force));
}

export function layerNeedsResolution(layer: Layer, force = false): boolean {
  if (!("sourceQuery" in layer) || !layer.sourceQuery) return false;
  if (force) return true;
  if (layer.resolution?.status === "resolved" && isDrawnLine(layer)) return false;
  if (layer.resolution?.status === "resolved" && isPlacedLabel(layer)) return false;
  return true;
}

/**
 * 只解析带 sourceQuery 且还没有有效几何的图层。
 * 失败时保留原几何，不写入猜测坐标。
 */
export async function resolveProject(
  project: MapProject,
  resolver: GeoResolver,
  options: { force?: boolean; selections?: Record<string, string> } = {},
): Promise<ProjectResolution> {
  const reports: LayerResolutionReport[] = [];
  const layers: Layer[] = [];
  for (const layer of project.layers) {
    if (!layerNeedsResolution(layer, options.force)) {
      layers.push(layer);
      if ("sourceQuery" in layer && layer.sourceQuery) {
        reports.push({ id: layer.id, status: "skipped", message: "使用已保存的几何", warnings: [], candidates: [] });
      }
      continue;
    }
    if (!("sourceQuery" in layer) || !layer.sourceQuery) {
      layers.push(layer);
      continue;
    }
    const query = withSelection(layer.sourceQuery, options.selections?.[layer.id]);
    const result = await resolveSourceQuery(resolver, query);
    reports.push({
      id: layer.id,
      status: result.status,
      message: result.message,
      warnings: result.warnings,
      candidates: result.candidates,
    });
    if (result.status !== "resolved" || result.value === undefined) {
      layers.push(layer);
      continue;
    }
    layers.push(applyResolution(layer, query, result));
  }
  const ok = reports.every((report) => report.status === "resolved" || report.status === "skipped");
  return {
    ok,
    project: { ...project, layers },
    reports,
  };
}

export function createDefaultResolver(project: MapProject): GeoResolver {
  const geocoding = project.providers?.geocoding;
  const roads = project.providers?.roads;
  const routing = project.providers?.routing;
  return createGeoResolver(
    createOsmCatalog({
      geocoder: new NominatimGeocoder({
        ...(geocoding?.endpoint ? { endpoint: geocoding.endpoint } : {}),
        ...(geocoding?.timeoutMs ? { timeoutMs: geocoding.timeoutMs } : {}),
        ...(geocoding?.minIntervalMs !== undefined ? { minIntervalMs: geocoding.minIntervalMs } : {}),
      }),
      roads: new OverpassRoadProvider({
        ...(roads?.endpoint ? { endpoint: roads.endpoint } : {}),
        ...(roads?.timeoutMs ? { timeoutMs: roads.timeoutMs } : {}),
        ...(roads?.minIntervalMs !== undefined ? { minIntervalMs: roads.minIntervalMs } : {}),
      }),
      routing: new OsrmRoutingProvider({
        ...(routing?.endpoint ? { endpoint: routing.endpoint } : {}),
        ...(routing?.timeoutMs ? { timeoutMs: routing.timeoutMs } : {}),
        ...(routing?.minIntervalMs !== undefined ? { minIntervalMs: routing.minIntervalMs } : {}),
      }),
    }),
  );
}

export function createOsmCatalog(providers: {
  geocoder: NominatimGeocoder;
  roads: OverpassRoadProvider;
  routing: OsrmRoutingProvider;
}): GeoCatalog {
  return {
    async searchPlaces(name, scope) {
      const text = scope?.city && !name.includes(scope.city) ? `${scope.city} ${name}` : name;
      return providers.geocoder.search(text);
    },
    async searchRoads(name, scope) {
      const bounds = scope?.bounds ?? (await cityBounds(providers.geocoder, scope?.city, scope?.areaId));
      if (!bounds) return [];
      return providers.roads.waysByName(name, bounds);
    },
    roadsNear(position, radiusMeters) {
      return providers.roads.waysNear(position, radiusMeters);
    },
    route(start, end) {
      return providers.routing.route(start, end);
    },
  };
}

async function cityBounds(
  geocoder: NominatimGeocoder,
  city: string | undefined,
  areaId?: string,
): Promise<[number, number, number, number] | null> {
  if (!city) return null;
  const choice = chooseAreaBounds(await geocoder.search(city), areaId);
  if (!choice) return null;
  if ("ambiguous" in choice) throw new AmbiguousScopeError(choice.ambiguous);
  return choice.bounds;
}

function withSelection(query: SourceQuery, candidateId: string | undefined): SourceQuery {
  if (!candidateId || query.candidateId) return query;
  return { ...query, candidateId };
}

async function resolveSourceQuery(
  resolver: GeoResolver,
  query: SourceQuery,
): Promise<ResolutionResult<LineGeometry | ResolvedPlace | ResolvedIntersection>> {
  if (query.type === "place") return resolver.resolvePlace(query);
  if (query.type === "intersection") return resolver.resolveIntersection(query);
  if (query.type === "road") {
    return resolver.resolveRoad({
      name: query.road,
      ...(query.location ? { location: query.location } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
    });
  }
  if (query.type === "road-segment") return resolver.resolveRoadSegment(toSegment(query));
  if (query.type === "nearby-roads") return resolver.resolveNearbyRoads(query);
  return resolver.resolveRoute(toRoute(query));
}

function toSegment(query: Extract<SourceQuery, { type: "road-segment" }>) {
  return {
    road: query.road,
    from: toAnchor(query.from),
    to: toAnchor(query.to),
    ...(query.location ? { location: query.location } : {}),
    ...(query.candidateId ? { candidateId: query.candidateId } : {}),
  };
}

function toRoute(query: Extract<SourceQuery, { type: "route" }>) {
  return {
    from: toAnchor(query.from),
    to: toAnchor(query.to),
    ...(query.location ? { location: query.location } : {}),
    ...(query.candidateId ? { candidateId: query.candidateId } : {}),
  };
}

function toAnchor(anchor: Extract<SourceQuery, { type: "road-segment" }>["from"]): AnchorQuery {
  if (anchor.type === "coordinate") {
    return { type: "coordinate", position: anchor.position, ...(anchor.crs ? { crs: anchor.crs } : {}) };
  }
  if (anchor.type === "place") return { type: "place", name: anchor.name };
  return { type: "intersection", road: anchor.road };
}

function applyResolution(
  layer: Layer,
  query: SourceQuery,
  result: ResolutionResult<LineGeometry | ResolvedPlace | ResolvedIntersection>,
): Layer {
  const resolvedAt = new Date().toISOString();
  const featureIds = featureIdList(result);
  const record: ResolutionRecord = {
    status: "resolved",
    ...(result.provider ? { provider: result.provider } : {}),
    resolvedAt,
    warnings: result.warnings,
    ...(featureIds.length > 0 ? { featureIds } : {}),
    ...(query.candidateId ? { candidateId: query.candidateId } : {}),
  };
  const source: SourceInfo = {
    kind: query.type === "route" ? "route" : query.type === "place" ? "imported" : "road",
    ...(result.provider ? { provider: result.provider } : {}),
    ...(featureIds[0] ? { featureId: featureIds.join(",").slice(0, 160) } : {}),
    fetchedAt: resolvedAt,
    query: { type: query.type },
  };
  if (query.type === "place" && layer.type === "label" && isPlace(result.value)) {
    return {
      ...layer,
      position: result.value.position,
      text: layer.text || result.value.name,
      resolution: { ...record, precision: result.value.precision },
      source,
    };
  }
  if (query.type === "intersection" && layer.type === "label" && isIntersection(result.value)) {
    return {
      ...layer,
      position: result.value.position,
      text: layer.text || result.value.name,
      resolution: { ...record, precision: "point", featureIds: result.value.featureIds.slice(0, 40) },
      source,
    };
  }
  if (layer.type === "road-highlight" && isLine(result.value)) {
    return {
      ...layer,
      geometry: result.value,
      name: layer.name === "未命名" ? result.message.slice(0, 200) : layer.name,
      resolution: { ...record, precision: "road" },
      source,
    };
  }
  return layer;
}

function featureIdList(result: ResolutionResult<LineGeometry | ResolvedPlace | ResolvedIntersection>): string[] {
  if (result.value && isPlace(result.value) && result.value.featureId) return [result.value.featureId];
  if (result.value && isIntersection(result.value)) return result.value.featureIds.slice(0, 40);
  const raw = result.candidates[0]?.featureId;
  return raw ? raw.split(",").slice(0, 40) : [];
}

function isPlace(value: LineGeometry | ResolvedPlace | ResolvedIntersection | undefined): value is ResolvedPlace {
  return typeof value === "object" && value !== null && "precision" in value && "position" in value && !("coordinates" in value);
}

function isIntersection(value: LineGeometry | ResolvedPlace | ResolvedIntersection | undefined): value is ResolvedIntersection {
  return typeof value === "object" && value !== null && "roads" in value && "position" in value;
}

function isLine(value: LineGeometry | ResolvedPlace | ResolvedIntersection | undefined): value is LineGeometry {
  return typeof value === "object" && value !== null && "type" in value && (value.type === "LineString" || value.type === "MultiLineString");
}
