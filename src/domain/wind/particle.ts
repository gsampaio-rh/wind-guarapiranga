import { type BoundsGrid, gridCenter, offsetMeters } from "../geo";
import { inReservoir } from "../water";

/** Blends constant wind and gust speed by the gust envelope (0–1). */
export function blendSpeed(mean: number, gust: number, envelope: number): number {
  const peak = Math.max(mean, gust);
  return mean + (peak - mean) * envelope;
}

/** How much faster than the constant wind a particle should move right now. */
export function speedScale(mean: number, speed: number): number {
  return mean > 0.05 ? speed / mean : 1;
}

/**
 * Picks a point inside the water, starting from a random water grid cell and
 * jittering within it; falls back to the grid center if nothing lands in water.
 */
export function pickWaterPoint(
  grid: BoundsGrid,
  waterCells: { col: number; row: number }[],
  rings: number[][][],
  random: () => number = Math.random,
): { lng: number; lat: number } {
  let origin = { lng: (grid.west + grid.east) / 2, lat: (grid.south + grid.north) / 2 };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cell = waterCells[Math.floor(random() * waterCells.length)];
    if (!cell) break;
    origin = gridCenter(grid, cell.col, cell.row);
    const jitter = offsetMeters(origin.lng, origin.lat, (random() - 0.5) * 380, (random() - 0.5) * 380);
    if (inReservoir(rings, jitter.lng, jitter.lat)) return jitter;
  }
  return origin;
}

/** A particle's lifespan in seconds before it is recycled, in seconds of simulated time. */
export function randomLife(random: () => number = Math.random): number {
  return 8 + random() * 7;
}
