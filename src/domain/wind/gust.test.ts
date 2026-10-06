import { describe, expect, it } from "vitest";
import { GUST_LIFE, GUST_RISE, GUST_WAIT_MAX, armGust, gustEnvelope, restingGustState, tickGust } from "./gust";

describe("envelope da rajada", () => {
  it("começa em zero, sobe suave e chega ao pico no fim da subida", () => {
    expect(gustEnvelope(0)).toBe(0);
    expect(gustEnvelope(GUST_RISE / 2)).toBeCloseTo(0.5, 5);
    expect(gustEnvelope(GUST_RISE)).toBeCloseTo(1, 5);
  });

  it("sustenta o pico e volta a zero no fim da queda", () => {
    expect(gustEnvelope(GUST_RISE + 0.1)).toBeCloseTo(1, 5);
    expect(gustEnvelope(GUST_LIFE)).toBeCloseTo(0, 5);
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

  it("termina a rajada, sorteia a próxima espera entre 6 e 14 s e volta a zero", () => {
    const state = { gusting: true, gustClock: 0, gustWait: 0 };
    const envelope = tickGust(state, GUST_LIFE, true, () => 0.5);
    expect(envelope).toBe(0);
    expect(state.gusting).toBe(false);
    expect(state.gustWait).toBeGreaterThanOrEqual(6);
    expect(state.gustWait).toBeLessThanOrEqual(14);
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
