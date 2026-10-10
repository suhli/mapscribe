import type { LineGeometry, LngLat } from "@mapscribe/core";
import { MemoryCache } from "./cache.js";
import { distanceToGeometryMeters } from "./coordinates.js";
import { requestJson } from "./http.js";
import { DEFAULT_ENDPOINTS } from "./policy.js";
import { RateLimiter } from "./rate-limit.js";
import type { FetchLike, ProviderEndpoint, RoadProvider, RoadWay } from "./types.js";

interface OverpassGeometry {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometry[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export class OverpassRoadProvider implements RoadProvider {
  readonly id = "overpass";
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;
  private readonly cache: MemoryCache;
  private readonly fetchFn: FetchLike;

  constructor(options: ProviderEndpoint & { fetchFn?: FetchLike; cache?: MemoryCache } = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINTS.overpass;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.limiter = new RateLimiter(options.minIntervalMs ?? 1100);
    this.cache = options.cache ?? new MemoryCache();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async waysNear(position: LngLat, radiusMeters = 28): Promise<RoadWay[]> {
    const key = `overpass:${position[0].toFixed(5)}:${position[1].toFixed(5)}:${radiusMeters}`;
    const cached = this.cache.get<RoadWay[]>(key);
    if (cached) return cached;
    const query = `[out:json][timeout:12];way(around:${radiusMeters},${position[1]},${position[0]})["highway"];out geom tags;`;
    const body = new URLSearchParams({ data: query });
    const payload = await this.limiter.schedule(() =>
      requestJson<OverpassResponse>(this.fetchFn, this.endpoint, this.timeoutMs, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
      }),
    );
    const ways = parseOverpassWays(payload)
      .map((way) => ({ way, distance: distanceToGeometryMeters(position, way.geometry) }))
      .filter((item) => item.distance <= radiusMeters + 5)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => item.way);
    this.cache.set(key, ways, 10 * 60 * 1000);
    return ways;
  }
}

export function parseOverpassWays(payload: OverpassResponse): RoadWay[] {
  if (!payload.elements) return [];
  const ways: RoadWay[] = [];
  for (const element of payload.elements) {
    if (element.type !== "way" || element.id === undefined || !element.geometry) continue;
    const coordinates = element.geometry
      .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
      .map((point) => [point.lon, point.lat] as LngLat);
    if (coordinates.length < 2) continue;
    const geometry: LineGeometry = { type: "LineString", coordinates };
    ways.push({
      id: `way/${element.id}`,
      name: element.tags?.name ?? null,
      highway: element.tags?.highway ?? null,
      geometry,
    });
  }
  return ways;
}
