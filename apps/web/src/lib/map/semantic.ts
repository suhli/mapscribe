import {
  createEmptyProject,
  createId,
  isDrawnLine,
  isPlacedLabel,
  parseProject,
  ProjectError,
  type Layer,
  type LineGeometry,
  type LngLat,
  type MapProject,
  type SourceQuery,
} from "@mapscribe/core";
import {
  createGeoResolver,
  createOsmCatalog,
  NominatimGeocoder,
  OsrmRoutingProvider,
  OverpassRoadProvider,
  resolveProject,
  type GeoResolver,
  type ResolutionCandidate,
} from "@mapscribe/geo";
import { loadSettings } from "../settings";

export type SemanticMode = "place" | "road" | "intersection" | "segment" | "nearby" | "route";

export interface SemanticRequest {
  mode: SemanticMode;
  city: string;
  primary: string;
  secondary: string;
  fromRoad: string;
  toRoad: string;
  radiusMeters?: number;
  nearbyMode: "radius" | "along-road";
  entrance: boolean;
  candidateId?: string;
}

export interface SemanticOutcome {
  ok: boolean;
  message: string;
  warnings: string[];
  candidates: ResolutionCandidate[];
  layer?: Layer;
  preview: LineGeometry | null;
  focus?: LngLat;
  bounds?: [number, number, number, number];
}

let resolver: GeoResolver | null = null;

export function resetSemanticResolver(): void {
  resolver = null;
}

function editorResolver(): GeoResolver {
  if (resolver) return resolver;
  const settings = loadSettings();
  resolver = createGeoResolver(
    createOsmCatalog({
      geocoder: new NominatimGeocoder({
        endpoint: settings.geocodingEndpoint,
        timeoutMs: settings.geocodingTimeoutMs,
        minIntervalMs: settings.geocodingIntervalMs,
      }),
      roads: new OverpassRoadProvider({
        endpoint: settings.roadsEndpoint,
        timeoutMs: settings.roadsTimeoutMs,
        minIntervalMs: settings.roadsIntervalMs,
      }),
      routing: new OsrmRoutingProvider({
        endpoint: settings.routingEndpoint,
        timeoutMs: settings.routingTimeoutMs,
        minIntervalMs: settings.routingIntervalMs,
      }),
    }),
  );
  return resolver;
}

export function buildSourceQuery(request: SemanticRequest): { ok: true; query: SourceQuery } | { ok: false; error: string } {
  const city = request.city.trim();
  const location = city ? { city } : undefined;
  const primary = request.primary.trim();
  const secondary = request.secondary.trim();
  const fromRoad = request.fromRoad.trim();
  const toRoad = request.toRoad.trim();
  const shared = {
    ...(location ? { location } : {}),
    ...(request.candidateId ? { candidateId: request.candidateId } : {}),
  };
  if (request.mode === "place") {
    if (!primary) return { ok: false, error: "请填写地点名称" };
    return { ok: true, query: { type: "place", name: primary, precision: request.entrance ? "entrance" : "point", ...shared } };
  }
  if (!location) return { ok: false, error: "查询道路时请填写城市" };
  if (request.mode === "road") {
    if (!primary) return { ok: false, error: "请填写道路名称" };
    return { ok: true, query: { type: "road", road: primary, ...shared } };
  }
  if (request.mode === "intersection") {
    if (!primary || !secondary) return { ok: false, error: "请填写两条道路名称" };
    return { ok: true, query: { type: "intersection", roads: [primary, secondary], ...shared } };
  }
  if (request.mode === "segment") {
    if (!primary || !fromRoad || !toRoad) return { ok: false, error: "请填写道路和两端路口" };
    return {
      ok: true,
      query: {
        type: "road-segment",
        road: primary,
        from: { type: "intersection", road: fromRoad },
        to: { type: "intersection", road: toRoad },
        ...shared,
      },
    };
  }
  if (request.mode === "nearby") {
    if (!primary) return { ok: false, error: "请填写地点或道路" };
    const center = secondary
      ? { type: "intersection" as const, roads: [primary, secondary] as [string, string] }
      : { type: "place" as const, name: primary };
    return {
      ok: true,
      query: {
        type: "nearby-roads",
        center,
        mode: request.nearbyMode,
        ...(request.radiusMeters && request.radiusMeters > 0 ? { radiusMeters: request.radiusMeters } : {}),
        ...shared,
      },
    };
  }
  if (!fromRoad || !toRoad) return { ok: false, error: "请填写起点和终点" };
  return {
    ok: true,
    query: {
      type: "route",
      from: { type: "place", name: fromRoad },
      to: { type: "place", name: toRoad },
      profile: "driving",
      ...shared,
    },
  };
}

function draftLayer(query: SourceQuery): Layer {
  if (query.type === "place" || query.type === "intersection") {
    const text = query.type === "place" ? query.name : `${query.roads[0]} × ${query.roads[1]}`;
    return {
      id: createId("label"),
      type: "label",
      name: text.slice(0, 40),
      text,
      sourceQuery: query,
    } as Layer;
  }
  const name =
    query.type === "road" || query.type === "road-segment" ? query.road : query.type === "route" ? "驾车路线" : "附近道路";
  return {
    id: createId("road"),
    type: "road-highlight",
    name,
    sourceQuery: query,
  } as Layer;
}

export async function resolveSemantic(request: SemanticRequest): Promise<SemanticOutcome> {
  const built = buildSourceQuery(request);
  if (!built.ok) return { ok: false, message: built.error, warnings: [], candidates: [], preview: null };
  return resolveLayerQuery(draftLayer(built.query), editorResolver(), false, request.candidateId);
}

export async function reresolveLayer(project: MapProject, layer: Layer, candidateId?: string): Promise<SemanticOutcome> {
  return resolveLayerQuery(layer, editorResolver(), true, candidateId, project);
}

async function resolveLayerQuery(
  layer: Layer,
  geo: GeoResolver,
  force: boolean,
  candidateId?: string,
  project?: MapProject,
): Promise<SemanticOutcome> {
  try {
    const base = project ?? createEmptyProject();
    const parsed = parseProject({ ...base, layers: [layer] });
    const resolved = await resolveProject(parsed.project, geo, {
      force,
      ...(candidateId ? { selections: { [layer.id]: candidateId } } : {}),
    });
    const report = resolved.reports.find((item) => item.id === layer.id) ?? resolved.reports[0];
    const next = resolved.project.layers.find((item) => item.id === layer.id);
    if (!report || !next || report.status !== "resolved") {
      return {
        ok: false,
        message: report?.message ?? "解析失败",
        warnings: report?.warnings ?? [],
        candidates: report?.candidates ?? [],
        preview: null,
      };
    }
    const chosen = report.candidates.find((item) => item.id === candidateId) ?? report.candidates[0];
    return {
      ok: true,
      message: report.message,
      warnings: report.warnings,
      candidates: report.candidates,
      layer: next,
      preview: isDrawnLine(next) ? next.geometry : null,
      ...(isPlacedLabel(next) ? { focus: next.position } : {}),
      ...(chosen?.bounds ? { bounds: chosen.bounds } : {}),
    };
  } catch (error) {
    const message = error instanceof ProjectError || error instanceof Error ? error.message : "解析失败";
    return { ok: false, message, warnings: [], candidates: [], preview: null };
  }
}
