import { SHORE_SPLINE_SAMPLES, smoothPolygonRings } from "../domain/geo";
import rawWater from "./water.json";

/**
 * `water.json` traçado tem trechos retos longos entre vértices espaçados (poucos
 * pontos pra representar curvas reais da margem). A versão suavizada por spline é
 * a usada por padrão tanto pro desenho (preenchimento 2D, malha 3D) quanto pro
 * cálculo de curvatura da margem (F7, `build-curvature-grid.mjs`) — o traçado
 * original fica preservado aqui também, caso algo precise dele sem suavização.
 */
export const rawWaterFeature = rawWater;

export const smoothedWaterFeature = {
  ...rawWater,
  geometry: {
    ...rawWater.geometry,
    coordinates: smoothPolygonRings(rawWater.geometry.coordinates, SHORE_SPLINE_SAMPLES),
  },
};
