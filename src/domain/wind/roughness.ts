/**
 * F12: aceleração/abrigo pela rugosidade da margem (mata abriga, área aberta/construída
 * expõe mais), pré-computado por célula do grid de água a partir de uso do solo real do
 * OpenStreetMap (ver `scripts/build-roughness-grid.mjs`). Mesmo formato/interface dos
 * outros grids (`orographic.ts`, `curvature.ts`) — células sem dado de OSM por perto
 * ficam `null` (neutro), não um palpite.
 */
export type RoughnessGrid = {
  cols: number;
  rows: number;
  cells: (number[] | null)[];
};

const DIRECTION_COUNT = 8;
const DIRECTION_STEP = 360 / DIRECTION_COUNT;

/** Fator (0.85–1.08) para a célula do grid na direção exata de onde o vento vem. */
export function roughnessFactorAt(
  grid: RoughnessGrid | null,
  col: number,
  row: number,
  directionDeg: number,
): number {
  if (!grid || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 1;
  const factors = grid.cells[row * grid.cols + col];
  if (!factors) return 1;
  return interpolateRoughnessFactors(factors, directionDeg);
}

/** Interpola circularmente entre os 8 fatores amostrados (mesma lógica de `interpolateFactors` em orographic.ts). */
export function interpolateRoughnessFactors(factors: number[], directionDeg: number): number {
  if (factors.length !== DIRECTION_COUNT) return 1;
  const wrapped = ((directionDeg % 360) + 360) % 360;
  const index = wrapped / DIRECTION_STEP;
  const low = Math.floor(index) % DIRECTION_COUNT;
  const high = (low + 1) % DIRECTION_COUNT;
  const t = index - Math.floor(index);
  const a = factors[low] ?? 1;
  const b = factors[high] ?? 1;
  return a + (b - a) * t;
}
