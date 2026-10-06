export const GUST_RISE = 0.45;
export const GUST_HOLD = 0.4;
export const GUST_FALL = 0.45;
export const GUST_LIFE = GUST_RISE + GUST_HOLD + GUST_FALL;
export const GUST_WAIT_MIN = 6;
export const GUST_WAIT_MAX = 14;
const GUST_ARM_CHANCE = 0.12;

export type GustState = {
  gusting: boolean;
  gustClock: number;
  gustWait: number;
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** 0 at rest, 1 at the peak of the gust; rises, holds, then falls back to 0. */
export function gustEnvelope(age: number): number {
  if (age < GUST_RISE) return smoothStep(age / GUST_RISE);
  if (age < GUST_RISE + GUST_HOLD) return 1;
  return 1 - smoothStep((age - GUST_RISE - GUST_HOLD) / GUST_FALL);
}

export function nextGustWait(random: () => number = Math.random): number {
  return GUST_WAIT_MIN + random() * (GUST_WAIT_MAX - GUST_WAIT_MIN);
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
    return { gusting: true, gustClock: random() * GUST_LIFE, gustWait: nextGustWait(random) };
  }
  return restingGustState(random);
}

/**
 * Advances the gust clock by `dt` and returns the envelope value (0–1) to use as
 * the particle's trail color this frame. Mutates `state` in place.
 */
export function tickGust(state: GustState, dt: number, gustsOn: boolean, random: () => number = Math.random): number {
  if (!gustsOn) return 0;
  state.gustClock += dt;
  if (!state.gusting) {
    if (state.gustClock < state.gustWait) return 0;
    state.gusting = true;
    state.gustClock = 0;
  }
  if (state.gustClock >= GUST_LIFE) {
    state.gusting = false;
    state.gustClock = 0;
    state.gustWait = nextGustWait(random);
    return 0;
  }
  return gustEnvelope(state.gustClock);
}
