import { describe, expect, it } from "vitest";
import water from "../../data/water.json";
import { boundsGrid, gridCenter } from "../geo";
import { inReservoir, waterCellsOf, waterMask } from "../water";
import { blendSpeed, fetchFactor, gustRatio, localGustBias, pickWaterPoint, speedScale } from "./particle";

const rings = water.geometry.coordinates;
const grid = boundsGrid();
const mask = waterMask(grid, rings, (col, row) => gridCenter(grid, col, row));
const waterCells = waterCellsOf(grid, mask);

describe("velocidade da partícula", () => {
  it("mistura o vento constante e a rajada pelo envelope", () => {
    expect(blendSpeed(10, 20, 0)).toBe(10);
    expect(blendSpeed(10, 20, 1)).toBe(20);
    expect(blendSpeed(10, 20, 0.5)).toBe(15);
  });

  it("escala o deslocamento quando a velocidade sobe acima do vento constante", () => {
    expect(speedScale(10, 15)).toBe(1.5);
    expect(speedScale(0, 5)).toBe(1);
  });
});

describe("posição da partícula na água", () => {
  it("sempre nasce dentro da represa", () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const point = pickWaterPoint(grid, waterCells, rings);
      expect(inReservoir(rings, point.lng, point.lat)).toBe(true);
    }
  });
});

describe("fetchFactor (F4)", () => {
  // Caixa de 0.2° x 0.2° (~11 km de lado), grande o bastante para saturar o fetch (4 km).
  const box = [[
    [-46.9, -23.8],
    [-46.7, -23.8],
    [-46.7, -23.6],
    [-46.9, -23.6],
    [-46.9, -23.8],
  ]];
  const center = { lng: -46.8, lat: -23.7 };

  it("é neutro (1×) fora da água", () => {
    expect(fetchFactor(box, { lng: -46.0, lat: -23.0 }, 180)).toBe(1);
  });

  it("é baixo perto da margem (fetch curto)", () => {
    const nearShore = { lng: -46.8, lat: -23.799 };
    const factor = fetchFactor(box, nearShore, 180);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(1.05);
  });

  it("sobe perto do teto (fetch longo o bastante para saturar)", () => {
    const factor = fetchFactor(box, center, 180);
    expect(factor).toBeGreaterThan(1.15);
    expect(factor).toBeLessThanOrEqual(1.2);
  });

  it("é monotônico: mais fetch nunca dá fator menor", () => {
    const near = fetchFactor(box, { lng: -46.8, lat: -23.799 }, 180);
    const mid = fetchFactor(box, { lng: -46.8, lat: -23.75 }, 180);
    const far = fetchFactor(box, center, 180);
    expect(mid).toBeGreaterThanOrEqual(near);
    expect(far).toBeGreaterThanOrEqual(mid);
  });

  it("usa a direção certa: o mesmo ponto perto de bordas diferentes dá fetch diferente", () => {
    const nearSouthShore = { lng: -46.8, lat: -23.799 };
    const towardSouth = fetchFactor(box, nearSouthShore, 180);
    const towardNorth = fetchFactor(box, nearSouthShore, 0);
    expect(towardNorth).toBeGreaterThan(towardSouth);
  });
});

describe("gustRatio (sinal real para frequência/duração da rajada)", () => {
  it("é a razão rajada/vento médio quando há vento de referência", () => {
    expect(gustRatio(10, 20)).toBe(2);
    expect(gustRatio(9.6, 20.2)).toBeCloseTo(2.104, 3);
  });

  it("é neutro (1) quando o vento médio é perto de zero", () => {
    expect(gustRatio(0, 5)).toBe(1);
    expect(gustRatio(0.01, 5)).toBe(1);
  });
});

describe("localGustBias (relevo e fetch decidindo onde a rajada é mais provável)", () => {
  it("é neutro (0) sem relevo acelerando e sem o toggle de fetch", () => {
    expect(localGustBias(1, 1, false)).toBe(0);
  });

  it("sobe para 1 no topo da faixa orográfica (1,25×), mesmo sem fetch", () => {
    expect(localGustBias(1.25, 1, false)).toBeCloseTo(1, 5);
  });

  it("sobe perto da margem (fetch baixo) só quando o toggle de fetch está ligado", () => {
    expect(localGustBias(1, 1, true)).toBeCloseTo(1, 5);
    expect(localGustBias(1, 1, false)).toBe(0);
  });

  it("pega o sinal mais forte dos dois, não a soma", () => {
    const bothHigh = localGustBias(1.25, 1, true);
    expect(bothHigh).toBeLessThanOrEqual(1);
    expect(bothHigh).toBeCloseTo(1, 5);
  });

  it("sobe no topo da faixa de curvatura (1,2×) só quando o toggle de curvatura está ligado", () => {
    expect(localGustBias(1, 1, false, 1.2, true)).toBeCloseTo(1, 5);
    expect(localGustBias(1, 1, false, 1.2, false)).toBe(0);
  });

  it("pega o sinal mais forte entre relevo, fetch e curvatura", () => {
    const strongest = localGustBias(1, 1, false, 1.2, true);
    expect(strongest).toBeCloseTo(1, 5);
  });

  it("sobe no topo da faixa de rugosidade (1,08×) só quando o toggle de rugosidade está ligado", () => {
    expect(localGustBias(1, 1, false, 1, false, 1.08, true)).toBeCloseTo(1, 5);
    expect(localGustBias(1, 1, false, 1, false, 1.08, false)).toBe(0);
  });
});
