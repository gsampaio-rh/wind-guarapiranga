import { describe, expect, it } from "vitest";
import { isSaturday, matchesKind } from "./catalog";
import { WIND_DAYS, angleDelta, interpolateUv, sampleSeries } from "./series";

const KIND_ORDER = ["brisa-sudeste", "norte", "vento-forte", "calmaria"];

describe("catálogo e série", () => {
  it("guarda o sábado mais recente de cada tipo, nesta ordem", () => {
    expect(WIND_DAYS.map((day) => day.id)).toEqual(KIND_ORDER.filter((id) => WIND_DAYS.some((day) => day.id === id)));
    for (const day of WIND_DAYS) {
      expect(isSaturday(day.data)).toBe(true);
      expect(day.modelo).toBe("era5");
      const series = day.horas ? [day.horas] : [day.pontos?.barragem, day.pontos?.amores, day.pontos?.sul];
      expect(series.every((hours) => hours && matchesKind(day.id, hours))).toBe(true);
    }
  });

  it("reproduz a hora 15 do arquivo", () => {
    for (const day of WIND_DAYS) {
      const hours = day.horas;
      expect(hours).toBeTruthy();
      if (!hours) continue;
      const stored = hours[15];
      expect(stored).toBeTruthy();
      if (!stored) continue;
      const sample = sampleSeries(day, 15);
      expect(sample.velocidade).toBe(stored.velocidade);
      expect(sample.direcao).toBe(stored.direcao);
      expect(sample.rajada).toBe(stored.rajada);
    }
  });

  it("interpola de 350° para 10° pelo caminho curto", () => {
    const mid = interpolateUv(
      { velocidade: 10, direcao: 350, rajada: 8 },
      { velocidade: 10, direcao: 10, rajada: 12 },
      0.5,
    );
    expect(angleDelta(mid.direcao, 0)).toBeLessThan(5);
    expect(angleDelta(mid.direcao, 180)).toBeGreaterThan(90);
    expect(mid.v).toBeLessThan(0);
  });
});
