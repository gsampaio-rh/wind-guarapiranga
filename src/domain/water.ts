import type { BoundsGrid } from "./geo";

export function inReservoir(rings: number[][][], lng: number, lat: number): boolean {
  const outer = rings[0];
  if (!outer || !ringContains(outer, lng, lat)) return false;
  for (let index = 1; index < rings.length; index += 1) {
    const hole = rings[index];
    if (hole && ringContains(hole, lng, lat)) return false;
  }
  return true;
}

export function waterMask(grid: BoundsGrid, rings: number[][][], center: (col: number, row: number) => { lng: number; lat: number }): Uint8Array {
  const mask = new Uint8Array(grid.cols * grid.rows);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const point = center(col, row);
      if (inReservoir(rings, point.lng, point.lat)) mask[row * grid.cols + col] = 1;
    }
  }
  return mask;
}

export function waterCellsOf(grid: BoundsGrid, mask: Uint8Array): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (mask[row * grid.cols + col] === 1) cells.push({ col, row });
    }
  }
  return cells;
}

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let insideRing = false;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const current = ring[index];
    const previous = ring[prev];
    if (!current || !previous) continue;
    const xi = current[0] ?? 0;
    const yi = current[1] ?? 0;
    const xj = previous[0] ?? 0;
    const yj = previous[1] ?? 0;
    if (yi === yj) continue;
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) insideRing = !insideRing;
  }
  return insideRing;
}
