import type { LngLat } from "@mapscribe/core";
import { MemoryCache } from "./cache.js";
import { requestJson } from "./http.js";
import { DEFAULT_ENDPOINTS } from "./policy.js";
import { RateLimiter } from "./rate-limit.js";
import { ProviderRequestError, type FetchLike, type ProviderEndpoint, type RouteAlternative, type RoutingProvider } from "./types.js";

interface OsrmRoute {
  distance?: number;
  duration?: number;
  geometry?: { type?: string; coordinates?: unknown };
}

interface OsrmResponse {
  code?: string;
  routes?: OsrmRoute[];
}

export class RoutingError extends ProviderRequestError {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = "osrm";
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;
  private readonly cache: MemoryCache;
  private readonly fetchFn: FetchLike;

  constructor(options: ProviderEndpoint & { fetchFn?: FetchLike; cache?: MemoryCache } = {}) {
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINTS.routing).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.limiter = new RateLimiter(options.minIntervalMs ?? 1000);
    this.cache = options.cache ?? new MemoryCache();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async route(start: LngLat, end: LngLat): Promise<RouteAlternative[]> {
    const key = `osrm:${start.join(",")}:${end.join(",")}`;
    const cached = this.cache.get<RouteAlternative[]>(key);
    if (cached) return cached;
    const path = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    const url = `${this.endpoint}/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=true&steps=false`;
    const payload = await this.limiter.schedule(() =>
      requestJson<OsrmResponse>(this.fetchFn, url, this.timeoutMs),
    );
    const alternatives = parseOsrmRoutes(payload);
    this.cache.set(key, alternatives, 10 * 60 * 1000);
    return alternatives;
  }
}

/**
 * 只接受服务返回的 LineString。
 * 没有几何时抛出错误，而不是把起点和终点连成直线。
 */
export function parseOsrmRoutes(payload: OsrmResponse): RouteAlternative[] {
  if (payload.code !== "Ok" || !payload.routes || payload.routes.length === 0) {
    throw new RoutingError("没有找到沿道路的路线");
  }
  const alternatives: RouteAlternative[] = [];
  for (const route of payload.routes) {
    const geometry = route.geometry;
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
      continue;
    }
    const coordinates: LngLat[] = [];
    for (const pair of geometry.coordinates) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const longitude = Number(pair[0]);
      const latitude = Number(pair[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) continue;
      coordinates.push([longitude, latitude]);
    }
    if (coordinates.length < 2) continue;
    const distanceMeters = Number(route.distance ?? 0);
    const durationSeconds = Number(route.duration ?? 0);
    alternatives.push({
      geometry: { type: "LineString", coordinates },
      distanceMeters,
      durationSeconds,
      summary: formatRouteSummary(distanceMeters, durationSeconds),
    });
  }
  if (alternatives.length === 0) {
    throw new RoutingError("路线结果缺少道路几何");
  }
  return alternatives;
}

export function formatRouteSummary(distanceMeters: number, durationSeconds: number): string {
  const distance =
    distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.round(distanceMeters)} m`;
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return `${distance} · ${minutes} 分钟`;
}
