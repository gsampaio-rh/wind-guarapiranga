import { describe, expect, it } from "vitest";
import { isSaturday, matchesKind } from "./catalog";
import { WIND_DAYS, angleDelta, interpolateUv, interpolateValidation, sampleSeries } from "./series";

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

describe("interpolateValidation (F2, dados do INMET com buracos)", () => {
  it("interpola normalmente quando as duas horas vizinhas têm leitura", () => {
    const hours = Array.from({ length: 24 }, () => null) as (null | { velocidade: number; direcao: number; rajada: number })[];
    hours[10] = { velocidade: 10, direcao: 90, rajada: 15 };
    hours[11] = { velocidade: 20, direcao: 90, rajada: 25 };
    const result = interpolateValidation(hours, 10.5);
    expect(result).not.toBeNull();
    expect(result?.velocidade).toBeCloseTo(15, 5);
  });

  it("retorna null quando falta leitura numa das horas vizinhas", () => {
    const hours = Array.from({ length: 24 }, () => null) as (null | { velocidade: number; direcao: number; rajada: number })[];
    hours[10] = { velocidade: 10, direcao: 90, rajada: 15 };
    // hours[11] fica null: buraco de estação.
    expect(interpolateValidation(hours, 10.5)).toBeNull();
    expect(interpolateValidation(hours, 10)).not.toBeNull();
  });
});
