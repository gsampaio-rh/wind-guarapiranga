/**
 * F3: fator de aceleração/abrigo orográfico, pré-computado por célula do grid de
 * água a partir da elevação real do terreno a montante (ver scripts/build-orographic-grid.mjs).
 */
export type OrographicGrid = {
  cols: number;
  rows: number;
  /** Índice `row * cols + col`, igual ao de `waterMask`. `null` fora da água. */
  cells: (number[] | null)[];
};

const DIRECTION_COUNT = 8;
const DIRECTION_STEP = 360 / DIRECTION_COUNT;
/** Metade do vão do fator orográfico (0.8–1.25), usado para normalizar a assimetria em `deflectionAngle`. */
const FACTOR_HALF_SPAN = 0.225;
const MAX_DEFLECTION_DEG = 15;

/** Fator (0.8–1.25) para a célula do grid na direção exata de onde o vento vem. */
export function orographicFactorAt(
  grid: OrographicGrid | null,
  col: number,
  row: number,
  directionDeg: number,
): number {
  if (!grid || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 1;
  const factors = grid.cells[row * grid.cols + col];
  if (!factors) return 1;
  return interpolateFactors(factors, directionDeg);
}

/**
 * Desvio de direção (graus, sentido horário) na célula do grid, pelo mesmo relevo que
 * já acelera/abriga a velocidade. 0 (sem grid/célula/toggle) até ±15°.
 */
export function orographicDeflectionAt(
  grid: OrographicGrid | null,
  col: number,
  row: number,
  directionDeg: number,
): number {
  if (!grid || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
  const factors = grid.cells[row * grid.cols + col];
  if (!factors) return 0;
  return deflectionAngle(factors, directionDeg);
}

/**
 * Compara o fator orográfico amostrado a 45° de cada lado da direção do vento: se o lado
 * horário (direita, olhando a favor do vento) está mais aberto/acelerado que o lado
 * anti-horário (esquerda), o vento desvia para a direita — caminho de menor resistência,
 * mesma lógica de um fluxo que contorna lateralmente um obstáculo em vez de subir nele.
 * Clampado a ±15° porque a grade de 45° em 45° é grosseira demais para desvios maiores.
 */
export function deflectionAngle(factors: number[], directionDeg: number): number {
  if (factors.length !== DIRECTION_COUNT) return 0;
  const wrapped = ((directionDeg % 360) + 360) % 360;
  const base = Math.round(wrapped / DIRECTION_STEP) % DIRECTION_COUNT;
  const left = factors[(base - 1 + DIRECTION_COUNT) % DIRECTION_COUNT] ?? 1;
  const right = factors[(base + 1) % DIRECTION_COUNT] ?? 1;
  const asymmetry = (right - left) / 2;
  const degrees = (asymmetry / FACTOR_HALF_SPAN) * MAX_DEFLECTION_DEG;
  return Math.min(MAX_DEFLECTION_DEG, Math.max(-MAX_DEFLECTION_DEG, degrees));
}

/** Interpola circularmente entre os 8 fatores amostrados (N, NE, E, ... NW, passo de 45°). */
export function interpolateFactors(factors: number[], directionDeg: number): number {
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
