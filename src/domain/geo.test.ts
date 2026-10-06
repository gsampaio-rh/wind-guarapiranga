import { describe, expect, it } from "vitest";
import { boundsGrid } from "./geo";

describe("grade dos limites", () => {
  it("cobre os limites com cerca de 400 m", () => {
    const grid = boundsGrid();
    expect(grid.spacingM).toBeGreaterThan(360);
    expect(grid.spacingM).toBeLessThan(440);
    expect(grid.cols).toBeGreaterThan(10);
    expect(grid.rows).toBeGreaterThan(10);
  });
});
