/**
 * F7: aceleração/abrigo por curvatura da margem (ponta/península acelera, baía abriga),
 * pré-computado por célula do grid de água a partir só da geometria de `water.json`
 * (ver `scripts/build-curvature-grid.mjs`) — nenhum dado novo, nenhuma busca externa.
 * Mesmo formato/interface do grid orográfico (`orographic.ts`), para poder reaproveitar
 * o mesmo `deflectionAngle` com qualquer um dos dois grids.
 */
export type CurvatureGrid = {
  cols: number;
  rows: number;
  cells: (number[] | null)[];
};

const DIRECTION_COUNT = 8;
const DIRECTION_STEP = 360 / DIRECTION_COUNT;

/** Fator (0.85–1.2) para a célula do grid na direção exata de onde o vento vem. */
export function curvatureFactorAt(
  grid: CurvatureGrid | null,
  col: number,
  row: number,
  directionDeg: number,
): number {
  if (!grid || col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 1;
  const factors = grid.cells[row * grid.cols + col];
  if (!factors) return 1;
  return interpolateCurvatureFactors(factors, directionDeg);
}

/** Interpola circularmente entre os 8 fatores amostrados (mesma lógica de `interpolateFactors` em orographic.ts). */
export function interpolateCurvatureFactors(factors: number[], directionDeg: number): number {
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

/** Área assinada (shoelace) de um anel lng/lat; sinal indica o sentido de giro (não a área real em m²). */
export function ringOrientationSign(ring: number[][]): 1 | -1 {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const ax = a[0] ?? 0;
    const ay = a[1] ?? 0;
    const bx = b[0] ?? 0;
    const by = b[1] ?? 0;
    area += ax * by - bx * ay;
  }
  return area >= 0 ? 1 : -1;
}

/**
 * Caminha `arcDistanceM` metros ao longo do anel a partir do vértice `fromIndex`
 * (negativo = sentido contrário), interpolando dentro do último segmento.
 */
export function pointAtArcDistance(
  ring: number[][],
  fromIndex: number,
  arcDistanceM: number,
  distanceMetersFn: (aLng: number, aLat: number, bLng: number, bLat: number) => number,
): { lng: number; lat: number } {
  const n = ring.length;
  if (n === 0) return { lng: 0, lat: 0 };
  const step = arcDistanceM >= 0 ? 1 : -1;
  let remaining = Math.abs(arcDistanceM);
  let index = ((fromIndex % n) + n) % n;
  let current = ring[index];
  while (remaining > 0) {
    const nextIndex = ((index + step) % n + n) % n;
    const next = ring[nextIndex];
    if (!current || !next) break;
    const cx = current[0] ?? 0;
    const cy = current[1] ?? 0;
    const nx = next[0] ?? 0;
    const ny = next[1] ?? 0;
    const segment = distanceMetersFn(cx, cy, nx, ny);
    if (segment <= remaining && segment > 0) {
      remaining -= segment;
      index = nextIndex;
      current = next;
      continue;
    }
    const t = segment === 0 ? 0 : remaining / segment;
    return { lng: cx + (nx - cx) * t, lat: cy + (ny - cy) * t };
  }
  const point = current ?? ring[index];
  return { lng: point?.[0] ?? 0, lat: point?.[1] ?? 0 };
}

/**
 * Ângulo de giro (graus) do anel no vértice `index`, olhando `archWindowM` metros
 * para cada lado ao longo da margem. Positivo = ponta/península (acelera o vento),
 * negativo = baía/enseada (abriga) — já corrigido pelo sentido de giro do anel
 * (`ringOrientationSign`), então o sinal tem sempre o mesmo significado físico,
 * independente de o anel estar no sentido horário ou anti-horário.
 */
export function ringTurnAngleDeg(
  ring: number[][],
  index: number,
  archWindowM: number,
  distanceMetersFn: (aLng: number, aLat: number, bLng: number, bLat: number) => number,
): number {
  const n = ring.length;
  if (n < 3) return 0;
  const orientation = ringOrientationSign(ring);
  const b = ring[((index % n) + n) % n];
  if (!b) return 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  const a = pointAtArcDistance(ring, index, -archWindowM, distanceMetersFn);
  const c = pointAtArcDistance(ring, index, archWindowM, distanceMetersFn);
  const abX = bx - a.lng;
  const abY = by - a.lat;
  const bcX = c.lng - bx;
  const bcY = c.lat - by;
  const cross = abX * bcY - abY * bcX;
  const dot = abX * bcX + abY * bcY;
  if (cross === 0 && dot === 0) return 0;
  const turnDeg = (Math.atan2(cross, dot) * 180) / Math.PI;
  return -turnDeg * orientation;
}
