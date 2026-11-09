/**
 * F11: brisa de lago — circulação térmica local que, em dias de vento sinótico fraco e sol forte,
 * sopra da água (mais fria) para a terra (mais quente), mais forte perto da margem.
 *
 * É uma ESTIMATIVA calibrada pela literatura sobre lagos pequenos (poucos km de largura), não uma
 * medição: Alqueva (Portugal), Wheeler Lake (Alabama) e o próprio reservatório de Itaipu (Stivari
 * et al. 2003) mostram brisas de lago mensuráveis mesmo em corpos de água de ~2 km, mas suprimidas
 * quando o vento de fundo já passa de ~10 kt (~5 m/s) e mais fortes no início/meio da tarde.
 *
 * Os parâmetros abaixo (força máxima, limiar de supressão, alcance de decaimento) são valores de
 * ordem de grandeza consistentes com essa literatura, não números medidos no Guarapiranga — por
 * isso o efeito é sempre opcional (toggle `lakeBreeze`) e o texto de ajuda deixa isso explícito.
 */

const SUPPRESSION_WIND_KT = 10;
const MAX_BREEZE_KT = 3;
const DECAY_DISTANCE_M = 600;

/**
 * Quanto a terra já esquentou mais que a água nesta hora, de 0 (hora mais fria do dia,
 * de madrugada) a 1 (hora mais quente, geralmente início/meio da tarde) — serve de proxy
 * pra força da brisa térmica sem precisar inventar uma curva senoidal própria.
 */
export function heatingProgress(temperatureC: number, dayMinC: number, dayMaxC: number): number {
  const span = dayMaxC - dayMinC;
  if (span <= 0.1) return 0;
  return clamp01((temperatureC - dayMinC) / span);
}

/** 1 com vento de fundo calmo, caindo linearmente a 0 em `SUPPRESSION_WIND_KT` (brisa não compete com vento forte). */
export function windSuppression(meanWindKt: number): number {
  return clamp01(1 - meanWindKt / SUPPRESSION_WIND_KT);
}

/** Força da brisa (kt): máxima perto da margem, decaindo exponencialmente em direção ao centro do lago. */
export function breezeMagnitudeKt(heating: number, suppression: number, distanceFromShoreM: number): number {
  const decay = Math.exp(-Math.max(0, distanceFromShoreM) / DECAY_DISTANCE_M);
  return MAX_BREEZE_KT * clamp01(heating) * clamp01(suppression) * decay;
}

/** Vetor (u,v) da brisa: aponta da célula de água para a margem mais próxima, com a magnitude dada. */
export function breezeVector(magnitudeKt: number, towardShoreEast: number, towardShoreNorth: number): { u: number; v: number } {
  const length = Math.hypot(towardShoreEast, towardShoreNorth);
  if (length < 1e-9 || magnitudeKt <= 0) return { u: 0, v: 0 };
  return { u: (towardShoreEast / length) * magnitudeKt, v: (towardShoreNorth / length) * magnitudeKt };
}

export type ShoreProximity = { distanceM: number; towardEast: number; towardNorth: number };

/**
 * Vértice do anel da margem mais próximo de `point`, com a distância e a direção unitária
 * (leste/norte, metros) até ele. Varre todos os vértices do anel — ok fazer uma vez por célula
 * de água na inicialização, não a cada frame.
 */
export function nearestShoreProximity(
  ring: number[][],
  point: { lng: number; lat: number },
  eastNorthMetersFn: (fromLng: number, fromLat: number, toLng: number, toLat: number) => { east: number; north: number },
): ShoreProximity {
  let bestEast = 0;
  let bestNorth = 0;
  let bestDistance = Infinity;
  for (const vertex of ring) {
    const vLng = vertex[0];
    const vLat = vertex[1];
    if (vLng == null || vLat == null) continue;
    const { east, north } = eastNorthMetersFn(point.lng, point.lat, vLng, vLat);
    const distance = Math.hypot(east, north);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEast = east;
      bestNorth = north;
    }
  }
  if (!Number.isFinite(bestDistance) || bestDistance < 1) return { distanceM: bestDistance, towardEast: 0, towardNorth: 0 };
  return { distanceM: bestDistance, towardEast: bestEast / bestDistance, towardNorth: bestNorth / bestDistance };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
