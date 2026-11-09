import { type BoundsGrid, gridCenter, offsetMeters } from "../geo";
import { inReservoir } from "../water";
import { clamp01 } from "./gust";

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

const FETCH_STEP_M = 50;
const FETCH_MAX_DISTANCE_M = 4000;
const FETCH_MAX_BOOST = 0.2;
const FETCH_SATURATION_M = 1200;

/**
 * F4: fator de aceleração pela distância de água aberta a montante (fetch).
 * Marcha a montante em passos pequenos até sair da represa; quanto maior o
 * fetch, mais a camada limite sobre a água "esquece" o atrito da margem,
 * numa curva de saturação (sem ganho extra depois de ~1,2 km).
 */
export function fetchFactor(
  rings: number[][][],
  point: { lng: number; lat: number },
  directionDeg: number,
): number {
  if (!inReservoir(rings, point.lng, point.lat)) return 1;
  const rad = (directionDeg * Math.PI) / 180;
  const stepEast = FETCH_STEP_M * Math.sin(rad);
  const stepNorth = FETCH_STEP_M * Math.cos(rad);
  let fetch = 0;
  let current = point;
  while (fetch < FETCH_MAX_DISTANCE_M) {
    current = offsetMeters(current.lng, current.lat, stepEast, stepNorth);
    if (!inReservoir(rings, current.lng, current.lat)) break;
    fetch += FETCH_STEP_M;
  }
  return 1 + FETCH_MAX_BOOST * (1 - Math.exp(-fetch / FETCH_SATURATION_M));
}

const OROGRAPHIC_BIAS_SPAN = 0.25;
const FETCH_BIAS_SPAN = 0.2;
const CURVATURE_BIAS_SPAN = 0.2;
const ROUGHNESS_BIAS_SPAN = 0.08;

/**
 * Rajada/vento médio da hora: 1 (neutro) quando não há vento de referência.
 * Vem direto do dado do catálogo (não é sorteado) — horas com rajada bem
 * acima do vento médio devem produzir rajadas mais frequentes e sustentadas
 * (ver `gustFrequencyFactor`/`gustHoldFactor` em `gust.ts`).
 */
export function gustRatio(mean: number, gust: number): number {
  return mean > 0.05 ? gust / mean : 1;
}

/**
 * Quanto o relevo (fator orográfico, 0,8–1,25×), a proximidade da margem (fetch
 * curto), uma ponta/península perto (fator de curvatura, 0,85–1,2×) ou a
 * rugosidade da margem (área aberta/construída perto, fator 0,85–1,08×) tornam
 * este ponto mais turbulento, 0 (neutro) a 1 (máximo). Usa o sinal mais forte
 * dos quatro em vez de somar: qualquer um já basta para a rajada ficar mais
 * provável ali. Com os toggles correspondentes desligados, os fatores de
 * entrada já chegam neutros (1), então o resultado aqui também é neutro.
 */
export function localGustBias(
  terrainFactor: number,
  waterFetch: number,
  waterFetchOn: boolean,
  curvatureFactor = 1,
  shoreCurvatureOn = false,
  roughnessFactor = 1,
  shoreRoughnessOn = false,
): number {
  const terrainBias = clamp01((terrainFactor - 1) / OROGRAPHIC_BIAS_SPAN);
  const fetchBias = waterFetchOn ? clamp01((1.2 - waterFetch) / FETCH_BIAS_SPAN) : 0;
  const curvatureBias = shoreCurvatureOn ? clamp01((curvatureFactor - 1) / CURVATURE_BIAS_SPAN) : 0;
  const roughnessBias = shoreRoughnessOn ? clamp01((roughnessFactor - 1) / ROUGHNESS_BIAS_SPAN) : 0;
  return Math.max(terrainBias, fetchBias, curvatureBias, roughnessBias);
}
