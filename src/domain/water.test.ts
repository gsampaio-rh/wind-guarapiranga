import { describe, expect, it } from "vitest";
import water from "../data/water.json";
import { inReservoir } from "./water";

describe("água", () => {
  it("reconhece a água e deixa ilha e terra de fora", () => {
    expect(inReservoir(water.geometry.coordinates, -46.7245181, -23.695741)).toBe(true);
    expect(inReservoir(water.geometry.coordinates, -46.7337197, -23.7335585)).toBe(false);
    expect(inReservoir(water.geometry.coordinates, -46.72, -23.66)).toBe(false);
  });
});
