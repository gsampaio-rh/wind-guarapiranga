export const GUST_RISE = 0.45;
export const GUST_HOLD = 0.4;
export const GUST_FALL = 0.45;
export const GUST_WAIT_MIN = 6;
export const GUST_WAIT_MAX = 14;
const GUST_ARM_CHANCE = 0.12;
const HOLD_FACTOR_MIN = 0.7;
const HOLD_FACTOR_MAX = 1.6;

export type GustState = {
  gusting: boolean;
  gustClock: number;
  gustWait: number;
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * Quão mais frequente a rajada deve ser aqui e agora, combinando dois sinais
 * reais em vez de puro acaso:
 * - `gustRatio` (rajada/vento médio da hora, ver `particle.ts`): horas em que
 *   o catálogo mostra rajada bem acima do vento médio geram rajadas mais
 *   seguidas; horas de vento parado geram rajadas raras.
 * - `localBias` 0–1 (ver `localGustBias` em `particle.ts`): quanto o relevo
 *   orográfico ou a proximidade da margem tornam o ponto mais turbulento.
 * Resultado: 0,5× (calmaria, sem relevo/margem perto) a 4× (hora com rajada
 * forte, bem na zona de aceleração ou perto da margem) a frequência base.
 */
export function gustFrequencyFactor(gustRatio: number, localBias: number): number {
  const ratioFactor = clamp(gustRatio / 1.5, 0.5, 2);
  return ratioFactor * (1 + clamp01(localBias));
}

/** Horas com rajada bem acima do vento médio seguram o pico um pouco mais. */
export function gustHoldFactor(gustRatio: number): number {
  return clamp(gustRatio / 1.6, HOLD_FACTOR_MIN, HOLD_FACTOR_MAX);
}

/** Duração total da rajada (subida + pico + queda) para um dado fator de sustentação. */
export function gustLife(holdFactor = 1): number {
  return GUST_RISE + GUST_HOLD * clamp(holdFactor, HOLD_FACTOR_MIN, HOLD_FACTOR_MAX) + GUST_FALL;
}

/** 0 at rest, 1 at the peak of the gust; rises, holds (hold scaled by `holdFactor`), then falls back to 0. */
export function gustEnvelope(age: number, holdFactor = 1): number {
  const hold = GUST_HOLD * clamp(holdFactor, HOLD_FACTOR_MIN, HOLD_FACTOR_MAX);
  if (age < GUST_RISE) return smoothStep(age / GUST_RISE);
  if (age < GUST_RISE + hold) return 1;
  return 1 - smoothStep((age - GUST_RISE - hold) / GUST_FALL);
}

const RAIN_FREQUENCY_GAIN = 0.3;
const RAIN_HOLD_GAIN = 0.1;
const RAIN_SATURATION_MM = 4;

/**
 * Chuva mais forte na hora deixa a rajada mais frequente (squall-like), saturando
 * perto de ~4 mm/h — chuvas mais fortes que isso não aumentam mais o efeito.
 * `chuva` vem direto de `sampleWeather` (ver `series.ts`); 0 quando não chove.
 */
export function rainGustFrequencyBoost(chuva: number): number {
  return 1 + RAIN_FREQUENCY_GAIN * (1 - Math.exp(-Math.max(0, chuva) / RAIN_SATURATION_MM));
}

/** Mesma curva de saturação, mas um ganho menor — a chuva sustenta o pico um pouco, não tanto quanto a frequência. */
export function rainGustHoldBoost(chuva: number): number {
  return 1 + RAIN_HOLD_GAIN * (1 - Math.exp(-Math.max(0, chuva) / RAIN_SATURATION_MM));
}

export function nextGustWait(frequencyFactor = 1, random: () => number = Math.random): number {
  const safeFactor = Math.max(0.1, frequencyFactor);
  const min = GUST_WAIT_MIN / safeFactor;
  const max = GUST_WAIT_MAX / safeFactor;
  return min + random() * (max - min);
}

export function restingGustState(random: () => number = Math.random): GustState {
  return { gusting: false, gustClock: 0, gustWait: random() * GUST_WAIT_MAX };
}

/**
 * Decides whether a particle starts gusting right away when gusts are switched on
 * (about 12% do, already mid-gust) or waits like the rest.
 */
export function armGust(active: boolean, random: () => number = Math.random): GustState {
  if (!active) return { gusting: false, gustClock: 0, gustWait: GUST_WAIT_MAX };
  if (random() < GUST_ARM_CHANCE) {
    return { gusting: true, gustClock: random() * gustLife(HOLD_FACTOR_MAX), gustWait: nextGustWait(1, random) };
  }
  return restingGustState(random);
}

/**
 * Advances the gust clock by `dt` and returns the envelope value (0–1) to use as
 * the particle's trail color this frame. Mutates `state` in place.
 * `frequencyFactor` e `holdFactor` vêm de `gustFrequencyFactor`/`gustHoldFactor`,
 * recalculados a cada frame com o vento e o local reais da partícula.
 */
export function tickGust(
  state: GustState,
  dt: number,
  gustsOn: boolean,
  frequencyFactor = 1,
  holdFactor = 1,
  random: () => number = Math.random,
): number {
  if (!gustsOn) return 0;
  state.gustClock += dt;
  if (!state.gusting) {
    if (state.gustClock < state.gustWait) return 0;
    state.gusting = true;
    state.gustClock = 0;
  }
  if (state.gustClock >= gustLife(holdFactor)) {
    state.gusting = false;
    state.gustClock = 0;
    state.gustWait = nextGustWait(frequencyFactor, random);
    return 0;
  }
  return gustEnvelope(state.gustClock, holdFactor);
}
