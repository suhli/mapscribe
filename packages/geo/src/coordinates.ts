import type { Layer, LineGeometry, LngLat, MapProject } from "@mapscribe/core";
import { isDrawnLine, isPlacedLabel } from "@mapscribe/core";

export type BBox = [west: number, south: number, east: number, north: number];

const EARTH_RADIUS_M = 6_378_137;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

/** 两点球面距离，单位米。 */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function projectMeters(origin: LngLat, point: LngLat): { x: number; y: number } {
  const latScale = (Math.PI / 180) * EARTH_RADIUS_M;
  const lngScale = latScale * Math.cos(toRad(origin[1]));
  return {
    x: (point[0] - origin[0]) * lngScale,
    y: (point[1] - origin[1]) * latScale,
  };
}

/** 点到线段的近似距离，单位米。 */
export function distanceToSegmentMeters(point: LngLat, start: LngLat, end: LngLat): number {
  const p = projectMeters(point, point);
  const a = projectMeters(point, start);
  const b = projectMeters(point, end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function geometryLines(geometry: LineGeometry): LngLat[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

export function distanceToGeometryMeters(point: LngLat, geometry: LineGeometry): number {
  let best = Number.POSITIVE_INFINITY;
  for (const line of geometryLines(geometry)) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      if (!start || !end) continue;
      best = Math.min(best, distanceToSegmentMeters(point, start, end));
    }
  }
  return best;
}

export function boundsOfCoordinates(coordinates: LngLat[]): BBox | null {
  const first = coordinates[0];
  if (!first) return null;
  let west = first[0];
  let south = first[1];
  let east = first[0];
  let north = first[1];
  for (const coordinate of coordinates) {
    west = Math.min(west, coordinate[0]);
    south = Math.min(south, coordinate[1]);
    east = Math.max(east, coordinate[0]);
    north = Math.max(north, coordinate[1]);
  }
  return [west, south, east, north];
}

export function expandBounds(bounds: BBox, paddingRatio = 0): BBox {
  const [west, south, east, north] = bounds;
  const width = Math.max(east - west, 0.0001);
  const height = Math.max(north - south, 0.0001);
  return [
    west - width * paddingRatio,
    south - height * paddingRatio,
    east + width * paddingRatio,
    north + height * paddingRatio,
  ];
}

export function unionBounds(target: BBox | null, next: BBox | null): BBox | null {
  if (!next) return target;
  if (!target) return next;
  return [
    Math.min(target[0], next[0]),
    Math.min(target[1], next[1]),
    Math.max(target[2], next[2]),
    Math.max(target[3], next[3]),
  ];
}

export function boundsOfGeometry(geometry: LineGeometry): BBox | null {
  return boundsOfCoordinates(geometryLines(geometry).flat());
}

export function boundsOfLayer(layer: Layer): BBox | null {
  if (isDrawnLine(layer)) return boundsOfGeometry(layer.geometry);
  if (isPlacedLabel(layer)) {
    return [layer.position[0], layer.position[1], layer.position[0], layer.position[1]];
  }
  return null;
}

export function boundsOfProject(project: MapProject): BBox | null {
  let bounds: BBox | null = null;
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    bounds = unionBounds(bounds, boundsOfLayer(layer));
  }
  return bounds;
}

/**
 * 解析用户输入的坐标。
 * 优先采用 GeoJSON 的 [经度, 纬度]；若该顺序非法而反过来合法，则按纬经度接受。
 */
export function parseCoordinateQuery(text: string): LngLat | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (!match?.[1] || !match[2]) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const asLngLat = validLngLat(first, second);
  if (asLngLat) return asLngLat;
  return validLngLat(second, first);
}

function validLngLat(longitude: number, latitude: number): LngLat | null {
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

export function moveVertex(
  geometry: LineGeometry,
  lineIndex: number,
  vertexIndex: number,
  position: LngLat,
): LineGeometry {
  const lines = geometryLines(geometry).map((line) => line.map((point) => [...point] as LngLat));
  const line = lines[lineIndex];
  if (!line || !line[vertexIndex]) return geometry;
  line[vertexIndex] = position;
  return geometry.type === "LineString"
    ? { type: "LineString", coordinates: line }
    : { type: "MultiLineString", coordinates: lines };
}

export function insertVertex(
  geometry: LineGeometry,
  lineIndex: number,
  afterIndex: number,
  position: LngLat,
): LineGeometry {
  const lines = geometryLines(geometry).map((line) => line.map((point) => [...point] as LngLat));
  const line = lines[lineIndex];
  if (!line) return geometry;
  line.splice(afterIndex + 1, 0, position);
  return geometry.type === "LineString"
    ? { type: "LineString", coordinates: line }
    : { type: "MultiLineString", coordinates: lines };
}

export function deleteVertex(
  geometry: LineGeometry,
  lineIndex: number,
  vertexIndex: number,
): LineGeometry | null {
  const lines = geometryLines(geometry).map((line) => line.map((point) => [...point] as LngLat));
  const line = lines[lineIndex];
  if (!line || line.length <= 2) return null;
  line.splice(vertexIndex, 1);
  return geometry.type === "LineString"
    ? { type: "LineString", coordinates: line }
    : { type: "MultiLineString", coordinates: lines };
}
