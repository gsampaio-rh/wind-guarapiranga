import { describe, expect, it } from "vitest";
import { breezeMagnitudeKt, breezeVector, heatingProgress, nearestShoreProximity, windSuppression } from "./lakeBreeze";

describe("heatingProgress", () => {
  it("é 0 na hora mais fria do dia e 1 na mais quente", () => {
    expect(heatingProgress(18, 18, 28)).toBe(0);
    expect(heatingProgress(28, 18, 28)).toBe(1);
  });

  it("é proporcional entre o mínimo e o máximo do dia", () => {
    expect(heatingProgress(23, 18, 28)).toBeCloseTo(0.5, 5);
  });

  it("cai para 0 se o dia não tem amplitude térmica (evita divisão por quase-zero)", () => {
    expect(heatingProgress(20, 20, 20.05)).toBe(0);
  });
});

describe("windSuppression", () => {
  it("é 1 com vento de fundo calmo", () => {
    expect(windSuppression(0)).toBe(1);
  });

  it("cai linearmente até 0 no limiar de supressão (10 kt)", () => {
    expect(windSuppression(5)).toBeCloseTo(0.5, 5);
    expect(windSuppression(10)).toBe(0);
  });

  it("fica em 0 (não negativo) acima do limiar", () => {
    expect(windSuppression(20)).toBe(0);
  });
});

describe("breezeMagnitudeKt", () => {
  it("é máxima perto da margem com aquecimento e vento calmos no auge", () => {
    expect(breezeMagnitudeKt(1, 1, 0)).toBeCloseTo(3, 5);
  });

  it("decai em direção ao centro do lago", () => {
    const nearShore = breezeMagnitudeKt(1, 1, 0);
    const farFromShore = breezeMagnitudeKt(1, 1, 1200);
    expect(farFromShore).toBeLessThan(nearShore);
    expect(farFromShore).toBeGreaterThan(0);
  });

  it("é 0 sem aquecimento ou totalmente suprimida pelo vento", () => {
    expect(breezeMagnitudeKt(0, 1, 0)).toBe(0);
    expect(breezeMagnitudeKt(1, 0, 0)).toBe(0);
  });
});

describe("breezeVector", () => {
  it("aponta na direção unitária informada, com a magnitude dada", () => {
    const { u, v } = breezeVector(3, 0, 1);
    expect(u).toBeCloseTo(0, 5);
    expect(v).toBeCloseTo(3, 5);
  });

  it("normaliza direções não-unitárias", () => {
    const { u, v } = breezeVector(2, 3, 4);
    expect(Math.hypot(u, v)).toBeCloseTo(2, 5);
  });

  it("é vetor zero sem magnitude ou sem direção definida", () => {
    expect(breezeVector(0, 1, 0)).toEqual({ u: 0, v: 0 });
    expect(breezeVector(3, 0, 0)).toEqual({ u: 0, v: 0 });
  });
});

describe("nearestShoreProximity", () => {
  const square = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ];
  const identityEastNorth = (fromLng: number, fromLat: number, toLng: number, toLat: number) => ({
    east: toLng - fromLng,
    north: toLat - fromLat,
  });

  it("acha o vértice mais próximo e a direção até ele", () => {
    const result = nearestShoreProximity(square, { lng: 1, lat: 1 }, identityEastNorth);
    expect(result.distanceM).toBeCloseTo(Math.hypot(1, 1), 5);
    expect(result.towardEast).toBeCloseTo(-1 / Math.SQRT2, 5);
    expect(result.towardNorth).toBeCloseTo(-1 / Math.SQRT2, 5);
  });

  it("devolve direção zero quando o ponto já está sobre a margem", () => {
    const result = nearestShoreProximity(square, { lng: 0, lat: 0 }, identityEastNorth);
    expect(result.towardEast).toBe(0);
    expect(result.towardNorth).toBe(0);
  });
});
