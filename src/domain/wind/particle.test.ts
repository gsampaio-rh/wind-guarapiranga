import { describe, expect, it } from "vitest";
import water from "../../data/water.json";
import { boundsGrid, gridCenter } from "../geo";
import { inReservoir, waterCellsOf, waterMask } from "../water";
import { blendSpeed, pickWaterPoint, speedScale } from "./particle";

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
