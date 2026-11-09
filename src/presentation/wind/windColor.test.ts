import { describe, expect, it } from "vitest";
import { SPEED_COLOR_STOPS, speedToColor } from "./windColor";

describe("speedToColor (escala fraco→forte)", () => {
  it("bate exatamente com os extremos da escala", () => {
    expect(speedToColor(0)).toEqual(SPEED_COLOR_STOPS[0]?.color);
    expect(speedToColor(26)).toEqual(SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1]?.color);
  });

  it("satura nas pontas: abaixo de 0 fica igual a 0, acima do topo fica igual ao topo", () => {
    expect(speedToColor(-5)).toEqual(speedToColor(0));
    expect(speedToColor(40)).toEqual(speedToColor(26));
  });

  it("interpola linearmente entre dois stops vizinhos", () => {
    const mid = speedToColor(2.5);
    const low = SPEED_COLOR_STOPS[0]!.color;
    const high = SPEED_COLOR_STOPS[1]!.color;
    for (let channel = 0; channel < 3; channel += 1) {
      expect(mid[channel]).toBeGreaterThanOrEqual(Math.min(low[channel], high[channel]));
      expect(mid[channel]).toBeLessThanOrEqual(Math.max(low[channel], high[channel]));
    }
  });

  it("o fraco contrasta com a água escura do mapa (#123e56), diferente do azul antigo", () => {
    const WATER: Rgb = [0x12, 0x3e, 0x56];
    const weak = speedToColor(0);
    expect(luminance(weak) - luminance(WATER)).toBeGreaterThan(0.4);
  });
});

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
