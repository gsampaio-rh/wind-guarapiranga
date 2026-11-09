import { describe, expect, it } from "vitest";
import {
  type CurvatureGrid,
  curvatureFactorAt,
  interpolateCurvatureFactors,
  pointAtArcDistance,
  ringOrientationSign,
  ringTurnAngleDeg,
} from "./curvature";

const euclid = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

describe("interpolateCurvatureFactors", () => {
  it("retorna o fator exato no limite de uma direção amostrada", () => {
    const factors = [1.15, 1, 1, 1, 0.9, 1, 1, 1];
    expect(interpolateCurvatureFactors(factors, 0)).toBe(1.15);
    expect(interpolateCurvatureFactors(factors, 180)).toBe(0.9);
  });

  it("cai para 1 se o array não tem 8 entradas", () => {
    expect(interpolateCurvatureFactors([1, 1], 90)).toBe(1);
  });
});

describe("curvatureFactorAt", () => {
  const grid: CurvatureGrid = {
    cols: 2,
    rows: 2,
    cells: [null, [1.15, 1, 1, 1, 0.9, 1, 1, 1], null, null],
  };

  it("retorna 1 quando o grid é null, fora dos limites, ou célula sem água", () => {
    expect(curvatureFactorAt(null, 0, 0, 0)).toBe(1);
    expect(curvatureFactorAt(grid, -1, 0, 0)).toBe(1);
    expect(curvatureFactorAt(grid, 0, 0, 0)).toBe(1);
  });

  it("busca o fator certo numa célula com dados, pela direção", () => {
    expect(curvatureFactorAt(grid, 1, 0, 0)).toBe(1.15);
    expect(curvatureFactorAt(grid, 1, 0, 180)).toBe(0.9);
  });
});

describe("ringOrientationSign", () => {
  it("reconhece um retângulo anti-horário (CCW) como +1", () => {
    const ccw = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(ringOrientationSign(ccw)).toBe(1);
  });

  it("reconhece um retângulo horário (CW) como -1", () => {
    const cw = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    expect(ringOrientationSign(cw)).toBe(-1);
  });
});

describe("pointAtArcDistance", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("fica no mesmo vértice com distância zero", () => {
    expect(pointAtArcDistance(square, 0, 0, euclid)).toEqual({ lng: 0, lat: 0 });
  });

  it("anda ao longo do anel na distância pedida", () => {
    expect(pointAtArcDistance(square, 0, 5, euclid)).toEqual({ lng: 5, lat: 0 });
  });

  it("anda no sentido contrário com distância negativa", () => {
    // de (0,0) para trás 5 vai para o último vértice (0,10) e desce 5: (0,5).
    expect(pointAtArcDistance(square, 0, -5, euclid)).toEqual({ lng: 0, lat: 5 });
  });

  it("atravessa múltiplos vértices quando a distância é maior que um lado", () => {
    expect(pointAtArcDistance(square, 0, 15, euclid)).toEqual({ lng: 10, lat: 5 });
  });
});

describe("ringTurnAngleDeg (sinal físico: + península acelera, - baía abriga)", () => {
  // Retângulo CCW com um bico apontando PARA DENTRO do interior (água) em (5,2):
  // o interior perde terreno ali — é terra entrando na água, uma península.
  // (8,0) é um vértice extra num trecho reto, só para testar o caso ~0°.
  const peninsula = [
    [0, 0], [4, 0], [5, 2], [6, 0], [8, 0], [10, 0], [10, 10], [0, 10],
  ];
  // Mesmo retângulo, mas o bico aponta PARA FORA do interior em (5,-2):
  // a água avança sobre a terra ali — uma baía/enseada.
  const bay = [
    [0, 0], [4, 0], [5, -2], [6, 0], [8, 0], [10, 0], [10, 10], [0, 10],
  ];

  it("dá ângulo positivo no bico de uma península (CCW)", () => {
    const angle = ringTurnAngleDeg(peninsula, 2, 2, euclid);
    expect(angle).toBeGreaterThan(0);
  });

  it("dá ângulo negativo no bico de uma baía (CCW)", () => {
    const angle = ringTurnAngleDeg(bay, 2, 2, euclid);
    expect(angle).toBeLessThan(0);
  });

  it("o mesmo anel invertido (sentido horário) dá o mesmo sinal físico", () => {
    const reversed = [...peninsula].reverse();
    const index = reversed.indexOf(peninsula[2]!);
    const angle = ringTurnAngleDeg(reversed, index, 2, euclid);
    expect(angle).toBeGreaterThan(0);
  });

  it("é ~zero num trecho reto da margem", () => {
    const angle = ringTurnAngleDeg(peninsula, 4, 2, euclid);
    expect(angle).toBeCloseTo(0, 1);
  });
});
