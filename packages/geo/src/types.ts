import type { LineGeometry, LngLat } from "@mapscribe/core";

export interface GeocodeResult {
  label: string;
  position: LngLat;
  bounds?: [number, number, number, number];
}

/** 地名与坐标转换。 */
export interface GeocodingProvider {
  readonly id: string;
  search(query: string): Promise<GeocodeResult[]>;
}

export interface RoadWay {
  id: string;
  name: string | null;
  highway: string | null;
  geometry: LineGeometry;
}

/**
 * 道路实体查询。
 * 这不是导航，只返回道路本身的几何。
 */
export interface RoadProvider {
  readonly id: string;
  waysNear(position: LngLat, radiusMeters?: number): Promise<RoadWay[]>;
}

export interface RouteAlternative {
  geometry: Extract<LineGeometry, { type: "LineString" }>;
  distanceMeters: number;
  durationSeconds: number;
  summary: string;
}

/**
 * 沿路网的路线计算。
 * 实现不得在失败时用起点和终点伪造一条直线。
 */
export interface RoutingProvider {
  readonly id: string;
  route(start: LngLat, end: LngLat): Promise<RouteAlternative[]>;
}

export interface TileStyleOption {
  id: string;
  title: { zh: string; en: string };
  style: string | Record<string, unknown>;
  attribution: string[];
  requiresKey: boolean;
}

export interface ProviderEndpoint {
  endpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ProviderRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderRequestError";
  }
}
