import { distanceMeters } from "../domain/geo";

type Point = { x: number; y: number; i: number };
type Node = Point & { prev: Node; next: Node };

export type WaterMesh = {
  lng: Float64Array;
  lat: Float64Array;
  indices: Uint32Array;
};

const MAX_EDGE_M = 140;

export function buildWaterMesh(rings: number[][][], maxEdgeM = MAX_EDGE_M): WaterMesh {
  const outer = ringPoints(rings[0] ?? []);
  const holes = rings.slice(1).map(ringPoints).filter((ring) => ring.length >= 3);
  if (outer.length < 3) return emptyMesh();
  orient(outer, true);

  const points = outer.map((point) => ({ x: point.x, y: point.y }));
  const numbered = outer.map((point, index) => ({ ...point, i: index }));
  const loop = link(numbered);
  if (!loop) return emptyMesh();

  const subdivided = subdivide(points, earClip(loop), maxEdgeM);
  const indices = dropHoles(subdivided.points, subdivided.indices, holes);
  return {
    lng: Float64Array.from(subdivided.points, (point) => point.x),
    lat: Float64Array.from(subdivided.points, (point) => point.y),
    indices: Uint32Array.from(indices),
  };
}

export function meshCovers(mesh: WaterMesh, lng: number, lat: number): boolean {
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] ?? 0;
    const b = mesh.indices[index + 1] ?? 0;
    const c = mesh.indices[index + 2] ?? 0;
    if (insideTriangle(lng, lat, mesh.lng[a] ?? 0, mesh.lat[a] ?? 0, mesh.lng[b] ?? 0, mesh.lat[b] ?? 0, mesh.lng[c] ?? 0, mesh.lat[c] ?? 0)) {
      return true;
    }
  }
  return false;
}

export function longestEdgeMeters(mesh: WaterMesh): number {
  let longest = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index] ?? 0, mesh.indices[index + 1] ?? 0, mesh.indices[index + 2] ?? 0];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge] ?? 0;
      const b = ids[(edge + 1) % 3] ?? 0;
      longest = Math.max(longest, distanceMeters(mesh.lng[a] ?? 0, mesh.lat[a] ?? 0, mesh.lng[b] ?? 0, mesh.lat[b] ?? 0));
    }
  }
  return longest;
}

function emptyMesh(): WaterMesh {
  return { lng: new Float64Array(), lat: new Float64Array(), indices: new Uint32Array() };
}

function ringPoints(ring: number[][]): Point[] {
  const points: Point[] = [];
  for (const pair of ring) {
    const x = pair[0];
    const y = pair[1];
    if (x == null || y == null) continue;
    const previous = points[points.length - 1];
    if (previous && previous.x === x && previous.y === y) continue;
    points.push({ x, y, i: 0 });
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) points.pop();
  return points;
}

function orient(points: Point[], counterClockwise: boolean): void {
  const positive = area(points) > 0;
  if (positive !== counterClockwise) points.reverse();
}

function area(points: Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function link(points: Point[]): Node | null {
  const first = points[0];
  if (!first || points.length < 3) return null;
  let previous: Node | null = null;
  let head: Node | null = null;
  for (const point of points) {
    const node = { ...point, prev: null as unknown as Node, next: null as unknown as Node };
    if (!head) head = node;
    if (previous) {
      previous.next = node;
      node.prev = previous;
    }
    previous = node;
  }
  if (!head || !previous) return null;
  previous.next = head;
  head.prev = previous;
  return head;
}

function dropHoles(points: { x: number; y: number }[], indices: number[], holes: Point[][]): number[] {
  if (holes.length === 0) return indices;
  const kept: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = points[indices[index] ?? 0];
    const b = points[indices[index + 1] ?? 0];
    const c = points[indices[index + 2] ?? 0];
    if (!a || !b || !c) continue;
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    if (holes.some((hole) => ringContains(hole, cx, cy))) continue;
    kept.push(indices[index] ?? 0, indices[index + 1] ?? 0, indices[index + 2] ?? 0);
  }
  return kept;
}

function ringContains(ring: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next || current.y === next.y) continue;
    const crosses = (current.y > y) !== (next.y > y);
    if (crosses && x < ((next.x - current.x) * (y - current.y)) / (next.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}

function earClip(start: Node): number[] {
  const indices: number[] = [];
  let cursor = start;
  let guard = 0;
  let remaining = countNodes(start);
  while (remaining > 3 && guard < remaining * remaining) {
    guard += 1;
    const prev = cursor.prev;
    const next = cursor.next;
    if (cross(prev, cursor, next) > 1e-14 && earIsEmpty(prev, cursor, next)) {
      indices.push(prev.i, cursor.i, next.i);
      prev.next = next;
      next.prev = prev;
      cursor = next;
      remaining -= 1;
      guard = 0;
      continue;
    }
    cursor = next;
  }
  if (remaining === 3) indices.push(cursor.prev.i, cursor.i, cursor.next.i);
  return indices;
}

function countNodes(start: Node): number {
  let count = 1;
  let cursor = start.next;
  while (cursor !== start) {
    count += 1;
    cursor = cursor.next;
  }
  return count;
}

function earIsEmpty(prev: Node, curr: Node, next: Node): boolean {
  let cursor = next.next;
  while (cursor !== prev) {
    if (insideTriangle(cursor.x, cursor.y, prev.x, prev.y, curr.x, curr.y, next.x, next.y)) return false;
    cursor = cursor.next;
  }
  return true;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function insideTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const ab = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const bc = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const ca = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const hasNeg = ab < -1e-14 || bc < -1e-14 || ca < -1e-14;
  const hasPos = ab > 1e-14 || bc > 1e-14 || ca > 1e-14;
  return !(hasNeg && hasPos);
}

function subdivide(points: { x: number; y: number }[], indices: number[], maxEdgeM: number): { points: { x: number; y: number }[]; indices: number[] } {
  let current = indices;
  for (let round = 0; round < 8; round += 1) {
    const cache = new Map<string, number>();
    const next: number[] = [];
    let grew = false;
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const found = cache.get(key);
      if (found != null) return found;
      const start = points[a];
      const end = points[b];
      const index = points.length;
      points.push({ x: ((start?.x ?? 0) + (end?.x ?? 0)) / 2, y: ((start?.y ?? 0) + (end?.y ?? 0)) / 2 });
      cache.set(key, index);
      return index;
    };
    for (let index = 0; index < current.length; index += 3) {
      const a = current[index] ?? 0;
      const b = current[index + 1] ?? 0;
      const c = current[index + 2] ?? 0;
      const pa = points[a];
      const pb = points[b];
      const pc = points[c];
      if (!pa || !pb || !pc) continue;
      const ab = distanceMeters(pa.x, pa.y, pb.x, pb.y) > maxEdgeM ? midpoint(a, b) : -1;
      const bc = distanceMeters(pb.x, pb.y, pc.x, pc.y) > maxEdgeM ? midpoint(b, c) : -1;
      const ca = distanceMeters(pc.x, pc.y, pa.x, pa.y) > maxEdgeM ? midpoint(c, a) : -1;
      if (ab >= 0 || bc >= 0 || ca >= 0) grew = true;
      emit(next, a, b, c, ab, bc, ca);
    }
    current = next;
    if (!grew) break;
  }
  return { points, indices: current };
}

function emit(out: number[], a: number, b: number, c: number, ab: number, bc: number, ca: number): void {
  const splits = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0);
  if (splits === 0) {
    out.push(a, b, c);
    return;
  }
  if (splits === 3) {
    out.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    return;
  }
  if (splits === 1) {
    if (ab >= 0) out.push(a, ab, c, ab, b, c);
    else if (bc >= 0) out.push(a, b, bc, a, bc, c);
    else out.push(a, b, ca, b, c, ca);
    return;
  }
  if (ca < 0) out.push(a, ab, c, ab, bc, c, ab, b, bc);
  else if (bc < 0) out.push(c, ca, b, ca, ab, b, ca, a, ab);
  else out.push(b, bc, a, bc, ca, a, bc, c, ca);
}
