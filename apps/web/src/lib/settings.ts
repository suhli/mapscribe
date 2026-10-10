import { DEFAULT_ENDPOINTS } from "@mapscribe/geo";

export interface LocalSettings {
  geocodingEndpoint: string;
  roadsEndpoint: string;
  routingEndpoint: string;
  geocodingTimeoutMs: number;
  roadsTimeoutMs: number;
  routingTimeoutMs: number;
  geocodingIntervalMs: number;
  roadsIntervalMs: number;
  routingIntervalMs: number;
  customStyleUrl: string;
  tilesApiKey: string;
}

const KEY = "mapscribe.settings.v1";

export function defaultSettings(): LocalSettings {
  return {
    geocodingEndpoint: DEFAULT_ENDPOINTS.geocoding,
    roadsEndpoint: DEFAULT_ENDPOINTS.overpass,
    routingEndpoint: DEFAULT_ENDPOINTS.routing,
    geocodingTimeoutMs: 12_000,
    roadsTimeoutMs: 15_000,
    routingTimeoutMs: 15_000,
    geocodingIntervalMs: 1100,
    roadsIntervalMs: 1100,
    routingIntervalMs: 1000,
    customStyleUrl: "",
    tilesApiKey: "",
  };
}

export function loadSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<LocalSettings>) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: LocalSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
