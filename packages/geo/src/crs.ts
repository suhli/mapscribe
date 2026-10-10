import type { LngLat } from "@mapscribe/core";

export type AxisOrderCrs = "WGS84" | "GCJ02" | "BD09";

const A = 6_378_245;
const EE = 0.00669342162296594323;
const X_PI = (Math.PI * 3000) / 180;

function outOfChina(longitude: number, latitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude: number, latitude: number): number {
  let value =
    -100 +
    2 * longitude +
    3 * latitude +
    0.2 * latitude * latitude +
    0.1 * longitude * latitude +
    0.2 * Math.sqrt(Math.abs(longitude));
  value += ((20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(latitude * Math.PI) + 40 * Math.sin((latitude / 3) * Math.PI)) * 2) / 3;
  value += ((160 * Math.sin((latitude / 12) * Math.PI) + 320 * Math.sin((latitude * Math.PI) / 30)) * 2) / 3;
  return value;
}

function transformLongitude(longitude: number, latitude: number): number {
  let value =
    300 +
    longitude +
    2 * latitude +
    0.1 * longitude * longitude +
    0.1 * longitude * latitude +
    0.1 * Math.sqrt(Math.abs(longitude));
  value += ((20 * Math.sin(6 * longitude * Math.PI) + 20 * Math.sin(2 * longitude * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(longitude * Math.PI) + 40 * Math.sin((longitude / 3) * Math.PI)) * 2) / 3;
  value += ((150 * Math.sin((longitude / 12) * Math.PI) + 300 * Math.sin((longitude / 30) * Math.PI)) * 2) / 3;
  return value;
}

/** OSM、Nominatim、Overpass 和 OSRM 的结果已经是 WGS84，不要再转换。 */
export function wgs84ToGcj02(position: LngLat): LngLat {
  const [longitude, latitude] = position;
  if (outOfChina(longitude, latitude)) return [longitude, latitude];
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35);
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35);
  const rad = (latitude / 180) * Math.PI;
  let magic = Math.sin(rad);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = (deltaLatitude * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  deltaLongitude = (deltaLongitude * 180) / ((A / sqrtMagic) * Math.cos(rad) * Math.PI);
  return [longitude + deltaLongitude, latitude + deltaLatitude];
}

export function gcj02ToWgs84(position: LngLat): LngLat {
  if (outOfChina(position[0], position[1])) return [position[0], position[1]];
  let wgs = position;
  for (let step = 0; step < 4; step += 1) {
    const gcj = wgs84ToGcj02(wgs);
    wgs = [wgs[0] + (position[0] - gcj[0]), wgs[1] + (position[1] - gcj[1])];
  }
  return wgs;
}

export function gcj02ToBd09(position: LngLat): LngLat {
  const [longitude, latitude] = position;
  const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * X_PI);
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function bd09ToGcj02(position: LngLat): LngLat {
  const x = position[0] - 0.0065;
  const y = position[1] - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** 把外部坐标转换成内部使用的 WGS84。相同坐标系时原样返回。 */
export function toWgs84(position: LngLat, from: AxisOrderCrs = "WGS84"): LngLat {
  if (from === "WGS84") return position;
  if (from === "GCJ02") return gcj02ToWgs84(position);
  return gcj02ToWgs84(bd09ToGcj02(position));
}
