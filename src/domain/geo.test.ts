import { describe, expect, it } from "vitest";
import { boundsGrid, rotateClockwise } from "./geo";

describe("grade dos limites", () => {
  it("cobre os limites com cerca de 400 m", () => {
    const grid = boundsGrid();
    expect(grid.spacingM).toBeGreaterThan(360);
    expect(grid.spacingM).toBeLessThan(440);
    expect(grid.cols).toBeGreaterThan(10);
    expect(grid.rows).toBeGreaterThan(10);
  });
});

describe("rotateClockwise", () => {
  it("não muda nada com ângulo zero", () => {
    expect(rotateClockwise(3, 4, 0)).toEqual({ u: 3, v: 4 });
  });

  it("gira norte (0,1) para leste (1,0) com 90° no sentido horário", () => {
    const { u, v } = rotateClockwise(0, 1, 90);
    expect(u).toBeCloseTo(1, 5);
    expect(v).toBeCloseTo(0, 5);
  });

  it("preserva a magnitude do vetor", () => {
    const { u, v } = rotateClockwise(3, 4, 37);
    expect(Math.hypot(u, v)).toBeCloseTo(5, 5);
  });
});
