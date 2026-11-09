import { describe, expect, it } from "vitest";
import {
  GUST_HOLD,
  GUST_RISE,
  GUST_WAIT_MAX,
  armGust,
  gustEnvelope,
  gustFrequencyFactor,
  gustHoldFactor,
  gustLife,
  nextGustWait,
  rainGustFrequencyBoost,
  rainGustHoldBoost,
  restingGustState,
  tickGust,
} from "./gust";

describe("envelope da rajada", () => {
  it("começa em zero, sobe suave e chega ao pico no fim da subida", () => {
    expect(gustEnvelope(0)).toBe(0);
    expect(gustEnvelope(GUST_RISE / 2)).toBeCloseTo(0.5, 5);
    expect(gustEnvelope(GUST_RISE)).toBeCloseTo(1, 5);
  });

  it("sustenta o pico e volta a zero no fim da queda", () => {
    expect(gustEnvelope(GUST_RISE + 0.1)).toBeCloseTo(1, 5);
    expect(gustEnvelope(gustLife())).toBeCloseTo(0, 5);
  });

  it("com holdFactor maior, sustenta o pico por mais tempo", () => {
    const t = GUST_RISE + GUST_HOLD + 0.05;
    expect(gustEnvelope(t, 1)).toBeLessThan(1);
    expect(gustEnvelope(t, 1.5)).toBeCloseTo(1, 5);
  });
});

describe("gustFrequencyFactor e gustHoldFactor (sinais reais, não sorteio)", () => {
  it("hora parada (rajada ≈ vento médio) e sem viés local dá a frequência mais baixa", () => {
    expect(gustFrequencyFactor(1, 0)).toBeCloseTo((1 / 1.5) * 1, 5);
  });

  it("hora bem mais gustosa e no meio da zona de aceleração dá a frequência mais alta", () => {
    const factor = gustFrequencyFactor(3, 1);
    expect(factor).toBeCloseTo(2 * 2, 5); // ratioFactor satura em 2, localFactor em 2
  });

  it("é monotônico: razão maior ou viés maior nunca reduz a frequência", () => {
    const base = gustFrequencyFactor(1.2, 0.2);
    expect(gustFrequencyFactor(1.8, 0.2)).toBeGreaterThan(base);
    expect(gustFrequencyFactor(1.2, 0.6)).toBeGreaterThan(base);
  });

  it("gustHoldFactor cresce com a razão rajada/vento médio, dentro dos limites", () => {
    expect(gustHoldFactor(1)).toBeCloseTo(0.7, 5);
    expect(gustHoldFactor(2.5)).toBeCloseTo(1.5625, 4);
    expect(gustHoldFactor(10)).toBeCloseTo(1.6, 5);
  });
});

describe("rainGustFrequencyBoost e rainGustHoldBoost (chuva da própria hora)", () => {
  it("é neutro (1×) sem chuva", () => {
    expect(rainGustFrequencyBoost(0)).toBe(1);
    expect(rainGustHoldBoost(0)).toBe(1);
  });

  it("é monotônico: mais chuva nunca reduz o reforço", () => {
    expect(rainGustFrequencyBoost(2)).toBeGreaterThan(rainGustFrequencyBoost(0.5));
    expect(rainGustHoldBoost(2)).toBeGreaterThan(rainGustHoldBoost(0.5));
  });

  it("satura perto de +30% na frequência e +10% na sustentação", () => {
    expect(rainGustFrequencyBoost(50)).toBeCloseTo(1.3, 2);
    expect(rainGustHoldBoost(50)).toBeCloseTo(1.1, 2);
  });

  it("chuva negativa (não deveria acontecer, mas por segurança) não dá reforço", () => {
    expect(rainGustFrequencyBoost(-5)).toBe(1);
  });
});

describe("relógio da rajada", () => {
  it("não avança quando a rajada está desligada", () => {
    const state = restingGustState(() => 0.9);
    const envelope = tickGust(state, 10, false);
    expect(envelope).toBe(0);
    expect(state.gustClock).toBe(0);
  });

  it("espera, depois começa a rajada e sobe a partir de zero", () => {
    const state = { gusting: false, gustClock: 0, gustWait: 5 };
    expect(tickGust(state, 2, true)).toBe(0);
    expect(tickGust(state, 2, true)).toBe(0);
    expect(tickGust(state, 2, true)).toBe(0);
    expect(state.gusting).toBe(true);
    expect(state.gustClock).toBe(0);
  });

  it("termina a rajada, sorteia a próxima espera já ajustada pela frequência e volta a zero", () => {
    const state = { gusting: true, gustClock: 0, gustWait: 0 };
    const envelope = tickGust(state, gustLife(), true, 1, 1, () => 0.5);
    expect(envelope).toBe(0);
    expect(state.gusting).toBe(false);
    expect(state.gustWait).toBeGreaterThanOrEqual(6);
    expect(state.gustWait).toBeLessThanOrEqual(14);
  });

  it("com frequência mais alta, a espera entre rajadas fica mais curta", () => {
    const slow = nextGustWait(1, () => 0);
    const fast = nextGustWait(2, () => 0);
    expect(fast).toBeLessThan(slow);
  });
});

describe("armGust", () => {
  it("ao desligar, limpa o estado e espera o máximo antes de poder repetir", () => {
    const state = armGust(false);
    expect(state.gusting).toBe(false);
    expect(state.gustWait).toBe(GUST_WAIT_MAX);
  });

  it("cerca de 12% nascem já no meio da rajada ao ligar", () => {
    const armed = armGust(true, () => 0.1);
    expect(armed.gusting).toBe(true);
    const resting = armGust(true, () => 0.5);
    expect(resting.gusting).toBe(false);
  });
});
