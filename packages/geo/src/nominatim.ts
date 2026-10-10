import { MemoryCache } from "./cache.js";
import { requestJson } from "./http.js";
import { DEFAULT_ENDPOINTS } from "./policy.js";
import { RateLimiter } from "./rate-limit.js";
import type { FetchLike, GeocodeResult, GeocodingProvider, ProviderEndpoint } from "./types.js";

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
  class?: string;
  type?: string;
  osm_type?: string;
  osm_id?: number;
  extratags?: { entrance?: string };
}

export class NominatimGeocoder implements GeocodingProvider {
  readonly id = "nominatim";
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;
  private readonly cache: MemoryCache;
  private readonly fetchFn: FetchLike;

  constructor(options: ProviderEndpoint & { fetchFn?: FetchLike; cache?: MemoryCache } = {}) {
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINTS.geocoding).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.limiter = new RateLimiter(options.minIntervalMs ?? 1100);
    this.cache = options.cache ?? new MemoryCache();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async search(query: string): Promise<GeocodeResult[]> {
    const text = query.trim();
    if (text.length < 2) return [];
    const key = `nominatim:${this.endpoint}:${text.toLowerCase()}`;
    const cached = this.cache.get<GeocodeResult[]>(key);
    if (cached) return cached;
    const url = new URL(`${this.endpoint}/search`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", text);
    url.searchParams.set("limit", "5");
    url.searchParams.set("extratags", "1");
    const payload = await this.limiter.schedule(() =>
      requestJson<NominatimItem[]>(this.fetchFn, url.toString(), this.timeoutMs),
    );
    if (!Array.isArray(payload)) {
      throw new Error("地理编码返回了无法识别的结果");
    }
    const results = payload.flatMap((item) => {
      const longitude = Number(item.lon);
      const latitude = Number(item.lat);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !item.display_name) return [];
      const box = item.boundingbox;
      const bounds =
        box && box.length === 4
          ? ([Number(box[2]), Number(box[0]), Number(box[3]), Number(box[1])] as [
              number,
              number,
              number,
              number,
            ])
          : undefined;
      const kind = placeKind(item);
      return [
        {
          label: item.display_name,
          position: [longitude, latitude] as [number, number],
          ...(bounds && bounds.every((value) => Number.isFinite(value)) ? { bounds } : {}),
          ...(item.osm_type && item.osm_id !== undefined ? { id: `${item.osm_type}/${item.osm_id}` } : {}),
          kind,
        },
      ];
    });
    this.cache.set(key, results, 24 * 60 * 60 * 1000);
    return results;
  }
}

function placeKind(item: NominatimItem): "poi" | "road" | "area" | "entrance" | "unknown" {
  if (item.type === "entrance" || item.extratags?.entrance) return "entrance";
  if (item.class === "highway") return "road";
  if (item.class === "boundary" || item.type === "administrative") return "area";
  if (item.class) return "poi";
  return "unknown";
}
