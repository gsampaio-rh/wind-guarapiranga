import { describe, expect, it } from "vitest";
import { deflectionAngle, interpolateFactors, orographicDeflectionAt, orographicFactorAt, type OrographicGrid } from "./orographic";

describe("interpolação dos fatores orográficos", () => {
  it("retorna o fator exato no limite de uma direção amostrada", () => {
    const factors = [1.2, 1, 1, 1, 0.8, 1, 1, 1];
    expect(interpolateFactors(factors, 0)).toBe(1.2);
    expect(interpolateFactors(factors, 180)).toBe(0.8);
  });

  it("interpola linearmente entre duas direções vizinhas", () => {
    const factors = [1, 1.2, 1, 1, 1, 1, 1, 1];
    expect(interpolateFactors(factors, 22.5)).toBeCloseTo(1.1, 5);
  });

  it("dá a volta de 315° para 0° sem quebrar", () => {
    const factors = [1.1, 1, 1, 1, 1, 1, 1, 0.9];
    expect(interpolateFactors(factors, 337.5)).toBeCloseTo(1, 5);
    expect(interpolateFactors(factors, 350)).toBeCloseTo(1 + (1.1 - 1) * (12.5 / 22.5), 5);
  });

  it("cai para 1 se o array de fatores não tem 8 entradas", () => {
    expect(interpolateFactors([1, 1], 90)).toBe(1);
  });
});

describe("orographicFactorAt", () => {
  const grid: OrographicGrid = {
    cols: 2,
    rows: 2,
    cells: [null, [1.2, 1, 1, 1, 0.8, 1, 1, 1], null, null],
  };

  it("retorna 1 quando o grid é null", () => {
    expect(orographicFactorAt(null, 0, 0, 0)).toBe(1);
  });

  it("retorna 1 fora dos limites do grid", () => {
    expect(orographicFactorAt(grid, -1, 0, 0)).toBe(1);
    expect(orographicFactorAt(grid, 5, 0, 0)).toBe(1);
  });

  it("retorna 1 numa célula sem água (null)", () => {
    expect(orographicFactorAt(grid, 0, 0, 0)).toBe(1);
  });

  it("busca o fator certo numa célula com dados, pela direção", () => {
    expect(orographicFactorAt(grid, 1, 0, 0)).toBe(1.2);
    expect(orographicFactorAt(grid, 1, 0, 180)).toBe(0.8);
  });
});

describe("deflectionAngle (desvio de direção pelo relevo)", () => {
  it("é zero quando os dois lados são iguais", () => {
    expect(deflectionAngle([1, 1, 1, 1, 1, 1, 1, 1], 90)).toBe(0);
  });

  it("desvia para o lado mais aberto (horário) quando ele acelera mais", () => {
    // direção 90 (E): vizinhos são índice 1 (NE, 45°) e índice 3 (SE, 135°).
    const factors = [1, 1, 1, 1.25, 1, 1, 1, 1];
    expect(deflectionAngle(factors, 90)).toBeGreaterThan(0);
  });

  it("desvia para o lado anti-horário quando o lado esquerdo acelera mais", () => {
    const factors = [1, 1.25, 1, 1, 1, 1, 1, 1];
    expect(deflectionAngle(factors, 90)).toBeLessThan(0);
  });

  it("satura em ±15°", () => {
    const factors = [1, 0.8, 1, 1.25, 1, 1, 1, 1];
    expect(deflectionAngle(factors, 90)).toBeCloseTo(15, 5);
  });

  it("cai para 0 se o array não tem 8 entradas", () => {
    expect(deflectionAngle([1, 1], 90)).toBe(0);
  });
});

describe("orographicDeflectionAt", () => {
  const grid: OrographicGrid = {
    cols: 2,
    rows: 2,
    cells: [null, [1, 1, 1, 1.25, 1, 1, 1, 1], null, null],
  };

  it("retorna 0 quando o grid é null, fora dos limites, ou célula sem água", () => {
    expect(orographicDeflectionAt(null, 0, 0, 90)).toBe(0);
    expect(orographicDeflectionAt(grid, -1, 0, 90)).toBe(0);
    expect(orographicDeflectionAt(grid, 0, 0, 90)).toBe(0);
  });

  it("busca o desvio certo numa célula com dados", () => {
    expect(orographicDeflectionAt(grid, 1, 0, 90)).toBeGreaterThan(0);
  });
});
