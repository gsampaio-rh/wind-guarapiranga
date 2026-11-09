import { writeFile } from "node:fs/promises";
import water from "../src/data/water.json" with { type: "json" };
import { SHORE_SPLINE_SAMPLES, boundsGrid, distanceMeters, gridCenter, offsetMeters, smoothRingCatmullRom } from "../src/domain/geo.ts";
import { ringTurnAngleDeg } from "../src/domain/wind/curvature.ts";
import { waterCellsOf, waterMask } from "../src/domain/water.ts";

// F7: aceleração/abrigo por curvatura da margem. Só usa a geometria já presente em
// water.json (sem busca externa): para cada célula de água e cada uma das 8 direções
// compassadas, marcha a montante até achar onde a margem corta aquela direção, acha
// o vértice do anel mais próximo desse ponto, e usa o ângulo de giro já pré-computado
// nesse vértice (ponta acelera, baía abriga). Sem corte na direção (água aberta), o
// fator fica neutro (1) — outros sinais (fetch/orográfico) já cobrem água aberta.
const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];
const SHORE_STEP_M = 50;
const SHORE_MAX_DISTANCE_M = 1500;
const ARC_WINDOW_M = 150;
const CURVATURE_GAIN = 1 / 300;
const FACTOR_MIN = 0.85;
const FACTOR_MAX = 1.2;

const rings = water.geometry.coordinates;
const rawOuter = rings[0];
if (!rawOuter) throw new Error("water.json sem anel externo");
// F7 usa um contorno suavizado (mesma spline Catmull-Rom do desenho) pra achar o
// vértice mais próximo e o ângulo de giro com mais fidelidade à curva real da
// margem — a classificação de células de água acima (waterMask) continua usando
// o anel original, só essa parte específica (ponta/baía) muda.
const outer = smoothRingCatmullRom(rawOuter, SHORE_SPLINE_SAMPLES);

const grid = boundsGrid();
const mask = waterMask(grid, rings, (col, row) => gridCenter(grid, col, row));
const waterCells = waterCellsOf(grid, mask);
process.stdout.write(`grid ${grid.cols}x${grid.rows}, ${waterCells.length} células de água\n`);

// Pré-computa o ângulo de giro (ponta/baía) em cada vértice do anel externo, uma vez.
const vertexTurnDeg = outer.map((_, index) => ringTurnAngleDeg(outer, index, ARC_WINDOW_M, distanceMeters));

const cells = new Array(grid.cols * grid.rows).fill(null);
let minFactor = Infinity;
let maxFactor = -Infinity;
let crossingsFound = 0;

for (const cell of waterCells) {
  const center = gridCenter(grid, cell.col, cell.row);
  const factors = DIRECTIONS.map((direction) => {
    const crossing = findShoreCrossing(center, direction);
    if (!crossing) return 1;
    crossingsFound += 1;
    const nearest = nearestVertexIndex(crossing);
    const turnDeg = vertexTurnDeg[nearest] ?? 0;
    const factor = clamp(1 + turnDeg * CURVATURE_GAIN, FACTOR_MIN, FACTOR_MAX);
    minFactor = Math.min(minFactor, factor);
    maxFactor = Math.max(maxFactor, factor);
    return Math.round(factor * 1000) / 1000;
  });
  cells[cell.row * grid.cols + cell.col] = factors;
}

const output = { cols: grid.cols, rows: grid.rows, spacingM: grid.spacingM, cells };
await writeFile(new URL("../src/data/curvature-grid.json", import.meta.url), `${JSON.stringify(output)}\n`);
process.stdout.write(`fator de curvatura: min=${minFactor.toFixed(3)} max=${maxFactor.toFixed(3)}\n`);
process.stdout.write(`cruzamentos com a margem: ${crossingsFound}/${waterCells.length * DIRECTIONS.length}\n`);
process.stdout.write(`grid gravado em src/data/curvature-grid.json (${waterCells.length} células com dados)\n`);

/** Marcha a montante na direção dada até saber onde a água desta célula termina. */
function findShoreCrossing(point, directionDeg) {
  const rad = (directionDeg * Math.PI) / 180;
  const stepEast = SHORE_STEP_M * Math.sin(rad);
  const stepNorth = SHORE_STEP_M * Math.cos(rad);
  let current = point;
  let traveled = 0;
  while (traveled < SHORE_MAX_DISTANCE_M) {
    const next = offsetMeters(current.lng, current.lat, stepEast, stepNorth);
    if (!inOuterRing(next)) return current;
    current = next;
    traveled += SHORE_STEP_M;
  }
  return null;
}

function inOuterRing(point) {
  let inside = false;
  for (let index = 0, prev = outer.length - 1; index < outer.length; prev = index, index += 1) {
    const a = outer[index];
    const b = outer[prev];
    if (!a || !b) continue;
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ay === by) continue;
    const crosses = ay > point.lat !== by > point.lat;
    if (crosses && point.lng < ((bx - ax) * (point.lat - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function nearestVertexIndex(point) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < outer.length; index += 1) {
    const vertex = outer[index];
    if (!vertex) continue;
    const d = distanceMeters(point.lng, point.lat, vertex[0] ?? 0, vertex[1] ?? 0);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  }
  return best;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
