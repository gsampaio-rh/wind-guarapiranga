import { describe, expect, it } from "vitest";
import { type RoughnessGrid, interpolateRoughnessFactors, roughnessFactorAt } from "./roughness";

describe("interpolateRoughnessFactors", () => {
  it("retorna o fator exato no limite de uma direção amostrada", () => {
    const factors = [0.85, 1, 1, 1, 1.08, 1, 1, 1];
    expect(interpolateRoughnessFactors(factors, 0)).toBe(0.85);
    expect(interpolateRoughnessFactors(factors, 180)).toBe(1.08);
  });

  it("cai para 1 se o array não tem 8 entradas", () => {
    expect(interpolateRoughnessFactors([1, 1], 90)).toBe(1);
  });
});

describe("roughnessFactorAt", () => {
  const grid: RoughnessGrid = {
    cols: 2,
    rows: 2,
    cells: [null, [0.85, 1, 1, 1, 1.08, 1, 1, 1], null, null],
  };

  it("retorna 1 quando o grid é null, fora dos limites, ou célula sem dado de OSM por perto", () => {
    expect(roughnessFactorAt(null, 0, 0, 0)).toBe(1);
    expect(roughnessFactorAt(grid, -1, 0, 0)).toBe(1);
    expect(roughnessFactorAt(grid, 0, 0, 0)).toBe(1);
  });

  it("busca o fator certo numa célula com dados, pela direção", () => {
    expect(roughnessFactorAt(grid, 1, 0, 0)).toBe(0.85);
    expect(roughnessFactorAt(grid, 1, 0, 180)).toBe(1.08);
  });
});
