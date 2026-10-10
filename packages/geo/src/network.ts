import type { LineGeometry, LngLat } from "@mapscribe/core";
import { geometryLines, haversineMeters } from "./coordinates.js";
import type { RoadWay } from "./types.js";

const NODE_DIGITS = 4;
const JUNCTION_METERS = 12;

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  coordinates: LngLat[];
  length: number;
  wayId: string;
}

export interface RoadGraph {
  nodes: Map<string, LngLat>;
  edges: GraphEdge[];
}

export interface Junction {
  position: LngLat;
  wayIds: [string, string];
  gradeSeparated: boolean;
}

export function nodeKey(point: LngLat): string {
  return `${point[0].toFixed(NODE_DIGITS)},${point[1].toFixed(NODE_DIGITS)}`;
}

export function sameGrade(left: RoadWay, right: RoadWay): boolean {
  if ((left.layer ?? 0) !== (right.layer ?? 0)) return false;
  if (Boolean(left.bridge) !== Boolean(right.bridge)) return false;
  if (Boolean(left.tunnel) !== Boolean(right.tunnel)) return false;
  return true;
}

export function buildGraph(ways: RoadWay[]): RoadGraph {
  const nodes = new Map<string, LngLat>();
  const edges: GraphEdge[] = [];
  for (const way of ways) {
    geometryLines(way.geometry).forEach((line, lineIndex) => {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index];
        const end = line[index + 1];
        if (!start || !end) continue;
        const from = nodeKey(start);
        const to = nodeKey(end);
        nodes.set(from, start);
        nodes.set(to, end);
        edges.push({
          id: `${way.id}:${lineIndex}:${index}`,
          from,
          to,
          coordinates: [start, end],
          length: haversineMeters(start, end),
          wayId: way.id,
        });
      }
    });
  }
  return { nodes, edges };
}

export function connectedComponents(graph: RoadGraph): string[][] {
  const seen = new Set<string>();
  const components: string[][] = [];
  const adjacent = adjacency(graph.edges);
  for (const node of graph.nodes.keys()) {
    if (seen.has(node)) continue;
    const stack = [node];
    const component: string[] = [];
    seen.add(node);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      component.push(current);
      for (const link of adjacent.get(current) ?? []) {
        if (seen.has(link.next)) continue;
        seen.add(link.next);
        stack.push(link.next);
      }
    }
    components.push(component);
  }
  return components;
}

export function componentOf(graph: RoadGraph, node: string): Set<string> {
  const target = connectedComponents(graph).find((component) => component.includes(node));
  return new Set(target ?? []);
}

export function findJunctions(leftWays: RoadWay[], rightWays: RoadWay[]): Junction[] {
  const found: Junction[] = [];
  for (const left of leftWays) {
    for (const right of rightWays) {
      if (left.id === right.id) continue;
      const separated = !sameGrade(left, right);
      for (const point of crossings(left, right)) {
        const duplicate = found.find((item) => haversineMeters(item.position, point) < 15);
        if (duplicate) continue;
        found.push({ position: point, wayIds: [left.id, right.id], gradeSeparated: separated });
      }
    }
  }
  return found;
}

function crossings(left: RoadWay, right: RoadWay): LngLat[] {
  const points: LngLat[] = [];
  const leftLines = geometryLines(left.geometry);
  const rightLines = geometryLines(right.geometry);
  for (const leftLine of leftLines) {
    for (const rightLine of rightLines) {
      for (const leftPoint of leftLine) {
        for (const rightPoint of rightLine) {
          if (haversineMeters(leftPoint, rightPoint) <= JUNCTION_METERS) points.push(leftPoint);
        }
      }
      for (let i = 0; i < leftLine.length - 1; i += 1) {
        const a = leftLine[i];
        const b = leftLine[i + 1];
        if (!a || !b) continue;
        for (let j = 0; j < rightLine.length - 1; j += 1) {
          const c = rightLine[j];
          const d = rightLine[j + 1];
          if (!c || !d) continue;
          const point = segmentIntersection(a, b, c, d);
          if (point) points.push(point);
        }
      }
    }
  }
  return points;
}

function segmentIntersection(a: LngLat, b: LngLat, c: LngLat, d: LngLat): LngLat | null {
  const origin = a;
  const project = (point: LngLat) => {
    const latScale = (Math.PI / 180) * 6_378_137;
    const lngScale = latScale * Math.cos((origin[1] * Math.PI) / 180);
    return { x: (point[0] - origin[0]) * lngScale, y: (point[1] - origin[1]) * latScale };
  };
  const start = project(a);
  const end = project(b);
  const otherStart = project(c);
  const otherEnd = project(d);
  const rx = end.x - start.x;
  const ry = end.y - start.y;
  const sx = otherEnd.x - otherStart.x;
  const sy = otherEnd.y - otherStart.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-6) return null;
  const qpx = otherStart.x - start.x;
  const qpy = otherStart.y - start.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  const latScale = (Math.PI / 180) * 6_378_137;
  const lngScale = latScale * Math.cos((origin[1] * Math.PI) / 180);
  const x = start.x + t * rx;
  const y = start.y + t * ry;
  return [origin[0] + x / lngScale, origin[1] + y / latScale];
}

export interface Snap {
  point: LngLat;
  distance: number;
  node: string;
  graph: RoadGraph;
}

/** 把点吸到道路几何上。超出 maxMeters 时返回 null，不造一条新线。 */
export function snapToWays(point: LngLat, ways: RoadWay[], maxMeters: number): Snap | null {
  return snapToGraph(point, buildGraph(ways), maxMeters);
}

export function snapToGraph(point: LngLat, graph: RoadGraph, maxMeters: number): Snap | null {
  let best: { edge: GraphEdge; point: LngLat; distance: number; ratio: number } | null = null;
  for (const edge of graph.edges) {
    const hit = closestOnSegment(point, edge.coordinates[0], edge.coordinates[1]);
    if (!hit) continue;
    if (!best || hit.distance < best.distance) best = { edge, ...hit };
  }
  if (!best || best.distance > maxMeters) return null;
  const start = best.edge.coordinates[0] ?? best.point;
  const end = best.edge.coordinates[1] ?? best.point;
  const before = haversineMeters(start, best.point);
  const after = haversineMeters(best.point, end);
  if (before <= 1) return { point: start, distance: best.distance, node: best.edge.from, graph };
  if (after <= 1) return { point: end, distance: best.distance, node: best.edge.to, graph };
  const node = `snap:${best.point[0].toFixed(6)},${best.point[1].toFixed(6)}`;
  graph.nodes.set(node, best.point);
  const edges = graph.edges.filter((edge) => edge.id !== best.edge.id);
  edges.push({
    ...best.edge,
    id: `${best.edge.id}:a`,
    to: node,
    coordinates: [start, best.point],
    length: before,
  });
  edges.push({
    ...best.edge,
    id: `${best.edge.id}:b`,
    from: node,
    coordinates: [best.point, end],
    length: after,
  });
  return { point: best.point, distance: best.distance, node, graph: { nodes: graph.nodes, edges } };
}

function closestOnSegment(point: LngLat, start: LngLat | undefined, end: LngLat | undefined): { point: LngLat; distance: number; ratio: number } | null {
  if (!start || !end) return null;
  const length = haversineMeters(start, end);
  if (length === 0) return { point: start, distance: haversineMeters(point, start), ratio: 0 };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 18; step += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    const leftPoint = interpolate(start, end, left);
    const rightPoint = interpolate(start, end, right);
    if (haversineMeters(point, leftPoint) < haversineMeters(point, rightPoint)) high = right;
    else low = left;
  }
  const ratio = (low + high) / 2;
  const nearest = interpolate(start, end, ratio);
  return { point: nearest, distance: haversineMeters(point, nearest), ratio };
}

function interpolate(start: LngLat, end: LngLat, ratio: number): LngLat {
  return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
}

export function pathsBetween(graph: RoadGraph, start: string, end: string): Array<Extract<LineGeometry, { type: "LineString" }>> {
  const first = shortestPath(graph.edges, start, end);
  if (!first) return [];
  const geometries = [pathGeometry(graph, start, first)];
  const used = new Set(first.map((edge) => edge.id));
  const second = shortestPath(
    graph.edges.filter((edge) => !used.has(edge.id)),
    start,
    end,
  );
  if (second) geometries.push(pathGeometry(graph, start, second));
  return geometries;
}

function shortestPath(edges: GraphEdge[], start: string, end: string): GraphEdge[] | null {
  if (start === end) return [];
  const adjacent = adjacency(edges);
  const distance = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { edge: GraphEdge; from: string }>();
  const queue = new Set([start]);
  while (queue.size > 0) {
    let current = "";
    let best = Number.POSITIVE_INFINITY;
    for (const node of queue) {
      const value = distance.get(node) ?? Number.POSITIVE_INFINITY;
      if (value < best) {
        best = value;
        current = node;
      }
    }
    if (!current || best === Number.POSITIVE_INFINITY) break;
    queue.delete(current);
    if (current === end) break;
    for (const link of adjacent.get(current) ?? []) {
      const next = best + link.edge.length;
      if (next < (distance.get(link.next) ?? Number.POSITIVE_INFINITY)) {
        distance.set(link.next, next);
        previous.set(link.next, { edge: link.edge, from: current });
        queue.add(link.next);
      }
    }
  }
  if (!previous.has(end)) return null;
  const path: GraphEdge[] = [];
  let cursor = end;
  while (cursor !== start) {
    const step = previous.get(cursor);
    if (!step) return null;
    path.push(step.edge);
    cursor = step.from;
  }
  path.reverse();
  return path;
}

function adjacency(edges: GraphEdge[]): Map<string, Array<{ edge: GraphEdge; next: string }>> {
  const map = new Map<string, Array<{ edge: GraphEdge; next: string }>>();
  for (const edge of edges) {
    const forward = map.get(edge.from) ?? [];
    forward.push({ edge, next: edge.to });
    map.set(edge.from, forward);
    const backward = map.get(edge.to) ?? [];
    backward.push({ edge, next: edge.from });
    map.set(edge.to, backward);
  }
  return map;
}

function pathGeometry(graph: RoadGraph, start: string, edges: GraphEdge[]): Extract<LineGeometry, { type: "LineString" }> {
  const origin = graph.nodes.get(start);
  const coordinates: LngLat[] = origin ? [origin] : [];
  let cursor = start;
  for (const edge of edges) {
    const forward = edge.from === cursor;
    const sequence = forward ? edge.coordinates : [...edge.coordinates].reverse();
    coordinates.push(...sequence.slice(1));
    cursor = forward ? edge.to : edge.from;
  }
  return { type: "LineString", coordinates };
}

export function clipWaysToRadius(ways: RoadWay[], center: LngLat, radiusMeters: number): LineGeometry | null {
  const lines: LngLat[][] = [];
  for (const way of ways) {
    for (const line of geometryLines(way.geometry)) {
      lines.push(...clipLine(line, center, radiusMeters));
    }
  }
  const usable = lines.filter((line) => line.length >= 2);
  if (usable.length === 0) return null;
  if (usable.length === 1 && usable[0]) return { type: "LineString", coordinates: usable[0] };
  return { type: "MultiLineString", coordinates: usable };
}

function clipLine(line: LngLat[], center: LngLat, radiusMeters: number): LngLat[][] {
  const parts: LngLat[][] = [];
  let current: LngLat[] = [];
  const inside = (point: LngLat) => haversineMeters(center, point) <= radiusMeters;
  const flush = () => {
    if (current.length >= 2) parts.push(current);
    current = [];
  };
  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index];
    const end = line[index + 1];
    if (!start || !end) continue;
    const startInside = inside(start);
    const endInside = inside(end);
    if (startInside && endInside) {
      if (current.length === 0) current.push(start);
      current.push(end);
    } else if (startInside && !endInside) {
      if (current.length === 0) current.push(start);
      current.push(boundary(start, end, center, radiusMeters));
      flush();
    } else if (!startInside && endInside) {
      current = [boundary(end, start, center, radiusMeters), end];
    }
  }
  flush();
  return parts;
}

function boundary(inside: LngLat, outside: LngLat, center: LngLat, radiusMeters: number): LngLat {
  let near = inside;
  let far = outside;
  for (let step = 0; step < 16; step += 1) {
    const mid: LngLat = [(near[0] + far[0]) / 2, (near[1] + far[1]) / 2];
    if (haversineMeters(center, mid) <= radiusMeters) near = mid;
    else far = mid;
  }
  return near;
}

export function waysToGeometry(ways: RoadWay[]): LineGeometry | null {
  const lines = ways.flatMap((way) => geometryLines(way.geometry)).filter((line) => line.length >= 2);
  if (lines.length === 0) return null;
  if (lines.length === 1 && lines[0]) return { type: "LineString", coordinates: lines[0] };
  return { type: "MultiLineString", coordinates: lines };
}

/** 从吸附点沿已有路网走指定米数，不生成路网里不存在的线。 */
export function traceNetwork(graph: RoadGraph, start: string, meters: number): LineGeometry | null {
  const adjacent = adjacency(graph.edges);
  const distance = new Map<string, number>([[start, 0]]);
  const queue = new Set([start]);
  const used = new Set<string>();
  const pieces: LngLat[][] = [];
  while (queue.size > 0) {
    let current = "";
    let best = Number.POSITIVE_INFINITY;
    for (const node of queue) {
      const value = distance.get(node) ?? Number.POSITIVE_INFINITY;
      if (value < best) {
        best = value;
        current = node;
      }
    }
    if (!current || best >= meters) break;
    queue.delete(current);
    for (const link of adjacent.get(current) ?? []) {
      if (used.has(link.edge.id)) continue;
      used.add(link.edge.id);
      const forward = link.edge.from === current;
      const sequence = forward ? link.edge.coordinates : [...link.edge.coordinates].reverse();
      const remain = meters - best;
      if (link.edge.length <= remain + 0.5) {
        pieces.push(sequence);
        const nextDistance = best + link.edge.length;
        if (nextDistance < (distance.get(link.next) ?? Number.POSITIVE_INFINITY)) {
          distance.set(link.next, nextDistance);
          queue.add(link.next);
        }
      } else if (sequence[0] && sequence[1]) {
        const ratio = remain / link.edge.length;
        pieces.push([sequence[0], interpolate(sequence[0], sequence[1], ratio)]);
      }
    }
  }
  const lines = pieces.filter((line) => line.length >= 2);
  if (lines.length === 0) return null;
  if (lines.length === 1 && lines[0]) return { type: "LineString", coordinates: lines[0] };
  return { type: "MultiLineString", coordinates: lines };
}

export function pointInBounds(point: LngLat, bounds: [number, number, number, number]): boolean {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}
