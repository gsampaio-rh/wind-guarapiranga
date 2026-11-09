import { writeFile } from "node:fs/promises";
import water from "../src/data/water.json" with { type: "json" };
import { boundsGrid, gridCenter, offsetMeters } from "../src/domain/geo.ts";
import { waterCellsOf, waterMask } from "../src/domain/water.ts";
import { createElevationSampler, runWithConcurrency } from "./lib/terrarium.mjs";

// 8 direções compassadas (de onde o vento vem), passo de 45°, começando no Norte.
const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];
// Seis distâncias a montante por direção (antes eram só 400/1200 m, via Open-Meteo,
// limitado por cota de API): dos vales/paredões bem perto da margem (200 m) até
// colinas isoladas mais distantes (2500 m) — fica o fator mais extremo das seis
// (o que mais foge de 1), não a média. Elevação vem dos tiles AWS Terrarium
// (`lib/terrarium.mjs`), estáticos no S3, sem cota de chamadas.
const UPWIND_DISTANCES_M = [200, 400, 700, 1200, 1800, 2500];
const ZOOM = 14;
const CONCURRENCY = 24;
const SLOPE_GAIN = 4;
const FACTOR_MIN = 0.8;
const FACTOR_MAX = 1.25;

const rings = water.geometry.coordinates;
const grid = boundsGrid();
const mask = waterMask(grid, rings, (col, row) => gridCenter(grid, col, row));
const waterCells = waterCellsOf(grid, mask);

process.stdout.write(`grid ${grid.cols}x${grid.rows}, ${waterCells.length} células de água\n`);

const sampler = createElevationSampler(ZOOM);
const ownElevationOf = new Map();
const upwindElevationOf = new Map();
const jobs = [];
for (const cell of waterCells) {
  const center = gridCenter(grid, cell.col, cell.row);
  jobs.push(async () => {
    ownElevationOf.set(cell, await sampler.sample(center.lng, center.lat));
  });
  for (const direction of DIRECTIONS) {
    const rad = (direction * Math.PI) / 180;
    for (const distance of UPWIND_DISTANCES_M) {
      const point = offsetMeters(center.lng, center.lat, distance * Math.sin(rad), distance * Math.cos(rad));
      const key = `${cell.col},${cell.row},${direction},${distance}`;
      jobs.push(async () => {
        upwindElevationOf.set(key, await sampler.sample(point.lng, point.lat));
      });
    }
  }
}
process.stdout.write(`amostrando elevação em ${jobs.length} pontos (zoom ${ZOOM}, tiles AWS Terrarium)\n`);
await runWithConcurrency(jobs, CONCURRENCY);
process.stdout.write(`${sampler.tileCount()} tiles baixados/decodificados\n`);

const cells = new Array(grid.cols * grid.rows).fill(null);
let minFactor = Infinity;
let maxFactor = -Infinity;
for (const cell of waterCells) {
  const ownElevation = ownElevationOf.get(cell);
  const factors = DIRECTIONS.map((direction) => {
    if (ownElevation == null) return 1;
    const candidates = UPWIND_DISTANCES_M.map((distance) => {
      const upwindElevation = upwindElevationOf.get(`${cell.col},${cell.row},${direction},${distance}`);
      if (upwindElevation == null) return 1;
      const slope = (upwindElevation - ownElevation) / distance;
      return clamp(1 - SLOPE_GAIN * slope, FACTOR_MIN, FACTOR_MAX);
    });
    // Fica o fator mais extremo das seis distâncias (o que mais foge de 1), não a média.
    const factor = candidates.reduce((most, next) => (Math.abs(next - 1) > Math.abs(most - 1) ? next : most), 1);
    minFactor = Math.min(minFactor, factor);
    maxFactor = Math.max(maxFactor, factor);
    return Math.round(factor * 1000) / 1000;
  });
  cells[cell.row * grid.cols + cell.col] = factors;
}

const output = { cols: grid.cols, rows: grid.rows, spacingM: grid.spacingM, cells };
await writeFile(new URL("../src/data/orographic-grid.json", import.meta.url), `${JSON.stringify(output)}\n`);
process.stdout.write(`fator orográfico: min=${minFactor.toFixed(3)} max=${maxFactor.toFixed(3)}\n`);
process.stdout.write(`grid gravado em src/data/orographic-grid.json (${waterCells.length} células com dados)\n`);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
