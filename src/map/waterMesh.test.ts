import { describe, expect, it } from "vitest";
import water from "../data/water.json";
import { buildWaterMesh, longestEdgeMeters, meshCovers } from "./waterMesh";

const rings = water.geometry.coordinates;

describe("malha da água", () => {
  const mesh = buildWaterMesh(rings, 160);

  it("cobre a Ilha dos Amores e deixa a Ilha do Eucalipto de fora", () => {
    expect(mesh.indices.length).toBeGreaterThan(30);
    expect(mesh.indices.length % 3).toBe(0);
    expect(meshCovers(mesh, -46.7245181, -23.695741)).toBe(true);
    expect(meshCovers(mesh, -46.7337197, -23.7335585)).toBe(false);
    expect(meshCovers(mesh, -46.72, -23.66)).toBe(false);
  });

  it("parte as arestas longas para a superfície acompanhar o relevo", () => {
    expect(longestEdgeMeters(mesh)).toBeLessThanOrEqual(170);
  });
});
