import { readFile, writeFile } from "node:fs/promises";
import water from "../src/data/water.json" with { type: "json" };
import { boundsGrid, gridCenter, offsetMeters } from "../src/domain/geo.ts";
import { waterCellsOf, waterMask } from "../src/domain/water.ts";

// F12: aceleração/abrigo pela rugosidade da margem, a partir de uso do solo real do
// OpenStreetMap (Overpass API) — mata perto da margem abriga (como o relevo orográfico),
// área aberta ou construída perto da margem expõe mais, e quanto mais alto o prédio mais
// isso pesa. Mesmo padrão de marcha a montante do grid de curvatura (F7): para cada célula
// de água e direção, acha onde a margem corta aquela direção, e dali anda mais pra dentro
// da terra em VÁRIAS distâncias (antes era só uma, 250 m) — fica o fator mais extremo
// das sondas (o que mais foge de 1), mesmo padrão do grid orográfico (F3).
// Sem dado de OSM por perto (ou se a Overpass API não responder), a célula fica neutra —
// nunca inventamos um fator sem dado real por trás.
//
// Este ambiente não consegue falar direto com a Overpass API (ver aviso no catch abaixo).
// Alternativa: rodar a query em https://overpass-turbo.eu (query salva em
// `scripts/overpass-query.txt`), usar "Export" → "download/copy raw data as JSON" (o
// formato nativo da Overpass, não o GeoJSON do osmtogeojson) e salvar em
// `scripts/overpass-landuse.geojson` — se esse arquivo existir, o script usa ele em vez
// da busca ao vivo. Dentro do bbox de São Paulo isso costuma incluir centenas de milhares
// de prédios tageados, então o teste ponto-no-polígono usa a `bounds` que a própria
// Overpass já devolve por elemento, pra descartar rápido os polígonos distantes.
const LOCAL_EXPORT_PATH = new URL("./overpass-landuse.geojson", import.meta.url);
const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315];
const SHORE_STEP_M = 50;
const SHORE_MAX_DISTANCE_M = 1500;
// Antes era uma sonda só (250 m); agora são quatro, do pé da margem até ~1 km pra
// dentro — um prédio ou bosque fora da distância única antiga deixava de ser visto.
const INLAND_PROBE_DISTANCES_M = [150, 300, 600, 1000];
const FOREST_FACTOR = 0.85;
const BUILDING_FACTOR = 1.08;
// Altura "típica" (3 andares) que calibra o fator antigo: um prédio nessa altura
// continua dando exatamente 1.08×, como antes. Prédio mais baixo pesa menos (quase
// neutro), mais alto pesa mais, até o teto do fator.
const BUILDING_REFERENCE_HEIGHT_M = 10;
const BUILDING_HEIGHT_WEIGHT_MIN = 0.3;
const BUILDING_HEIGHT_WEIGHT_MAX = 2.5;
const METERS_PER_LEVEL = 3.2; // mesma estimativa de `src/map/mapStyle.ts` (extrusão 3D).
const FACTOR_MIN = 0.85;
const FACTOR_MAX = 1.25;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_S = 60;
// Buffer de ~800 m além dos limites do app, pra pegar vegetação/construção
// logo depois da margem mesmo em células perto da borda do grid.
const BBOX_BUFFER_DEG = 0.008;

const rings = water.geometry.coordinates;
const outer = rings[0];
if (!outer) throw new Error("water.json sem anel externo");

const grid = boundsGrid();
const mask = waterMask(grid, rings, (col, row) => gridCenter(grid, col, row));
const waterCells = waterCellsOf(grid, mask);
process.stdout.write(`grid ${grid.cols}x${grid.rows}, ${waterCells.length} células de água\n`);

const bbox = {
  south: grid.south - BBOX_BUFFER_DEG,
  west: grid.west - BBOX_BUFFER_DEG,
  north: grid.north + BBOX_BUFFER_DEG,
  east: grid.east + BBOX_BUFFER_DEG,
};

let forestShapes = [];
let buildingShapes = [];
try {
  const localElements = await readLocalExport(LOCAL_EXPORT_PATH);
  let elements;
  if (localElements) {
    process.stdout.write(`usando export local do Overpass (scripts/overpass-landuse.geojson, ${localElements.length} elementos)...\n`);
    elements = localElements;
  } else {
    process.stdout.write("buscando uso do solo na Overpass API...\n");
    elements = await fetchLandCoverElements(bbox);
  }
  const shapes = elementsToShapes(elements);
  forestShapes = shapes.filter((shape) => isForestTags(shape.tags));
  buildingShapes = shapes.filter((shape) => isBuildingTags(shape.tags));
  const withHeight = buildingShapes.filter((shape) => buildingHeightM(shape.tags) !== null).length;
  process.stdout.write(`mata: ${forestShapes.length} polígonos · construído: ${buildingShapes.length} polígonos (${withHeight} com altura real)\n`);
} catch (error) {
  process.stdout.write(`aviso: Overpass indisponível e sem export local (${error.message}). Gravando grid neutro (sem dado).\n`);
  process.stdout.write("veja o comentário no topo do arquivo pra gerar scripts/overpass-landuse.geojson via Overpass Turbo.\n");
}

const cells = new Array(grid.cols * grid.rows).fill(null);
let classified = 0;
let minFactor = Infinity;
let maxFactor = -Infinity;

if (forestShapes.length > 0 || buildingShapes.length > 0) {
  for (const cell of waterCells) {
    const center = gridCenter(grid, cell.col, cell.row);
    const factors = DIRECTIONS.map((direction) => {
      const probes = findInlandProbes(center, direction);
      if (probes.length === 0) return 1;
      const candidates = probes.map((probe) => factorAtProbe(probe));
      const factor = candidates.reduce((most, next) => (Math.abs(next - 1) > Math.abs(most - 1) ? next : most), 1);
      if (factor !== 1) classified += 1;
      minFactor = Math.min(minFactor, factor);
      maxFactor = Math.max(maxFactor, factor);
      return Math.round(factor * 1000) / 1000;
    });
    cells[cell.row * grid.cols + cell.col] = factors;
  }
}

const output = { cols: grid.cols, rows: grid.rows, spacingM: grid.spacingM, cells };
await writeFile(new URL("../src/data/roughness-grid.json", import.meta.url), `${JSON.stringify(output)}\n`);
process.stdout.write(`fator de rugosidade: min=${isFinite(minFactor) ? minFactor.toFixed(3) : "–"} max=${isFinite(maxFactor) ? maxFactor.toFixed(3) : "–"}\n`);
process.stdout.write(`classificados: ${classified}/${waterCells.length * DIRECTIONS.length}\n`);
process.stdout.write(`grid gravado em src/data/roughness-grid.json\n`);

/** Fator de uma sonda: mata (flat), prédio (pesado pela altura real), ou neutro. */
function factorAtProbe(probe) {
  if (pointInAnyShape(probe, forestShapes)) return FOREST_FACTOR;
  const building = shapeContaining(probe, buildingShapes);
  if (building) return buildingFactor(buildingHeightM(building.tags));
  return 1;
}

/** Escala o fator de prédio pela altura real: baixo pesa pouco, alto pesa mais, até o teto do fator. */
function buildingFactor(heightM) {
  const height = heightM ?? BUILDING_REFERENCE_HEIGHT_M;
  const weight = clamp(height / BUILDING_REFERENCE_HEIGHT_M, BUILDING_HEIGHT_WEIGHT_MIN, BUILDING_HEIGHT_WEIGHT_MAX);
  return clamp(1 + (BUILDING_FACTOR - 1) * weight, FACTOR_MIN, FACTOR_MAX);
}

/** Altura (m) a partir de `height`, senão de `building:levels`/`levels` × 3.2 m, senão `null` (sem dado). */
function buildingHeightM(tags) {
  const height = Number.parseFloat(tags.height);
  if (Number.isFinite(height) && height > 0) return height;
  const levels = Number.parseFloat(tags["building:levels"] ?? tags.levels);
  if (Number.isFinite(levels) && levels > 0) return levels * METERS_PER_LEVEL;
  return null;
}

/** Marcha a montante até achar onde a água termina, depois sonda várias distâncias dentro da terra. */
function findInlandProbes(point, directionDeg) {
  const rad = (directionDeg * Math.PI) / 180;
  const stepEast = SHORE_STEP_M * Math.sin(rad);
  const stepNorth = SHORE_STEP_M * Math.cos(rad);
  let current = point;
  let traveled = 0;
  while (traveled < SHORE_MAX_DISTANCE_M) {
    const next = offsetMeters(current.lng, current.lat, stepEast, stepNorth);
    if (!inOuterRing(next)) {
      return INLAND_PROBE_DISTANCES_M.map((distance) =>
        offsetMeters(current.lng, current.lat, distance * Math.sin(rad), distance * Math.cos(rad)),
      );
    }
    current = next;
    traveled += SHORE_STEP_M;
  }
  return [];
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

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const a = ring[index];
    const b = ring[prev];
    if (!a || !b) continue;
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ay === by) continue;
    const crosses = ay > point.lat !== by > point.lat;
    if (crosses && point.lng < ((bx - ax) * (point.lat - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Confere a bounding box (bem mais rápido) antes do teste completo ponto-no-polígono — essencial com ~4·10^5 prédios. */
function pointInShape(point, shape) {
  const { bounds, ring } = shape;
  if (point.lat < bounds.minlat || point.lat > bounds.maxlat || point.lng < bounds.minlon || point.lng > bounds.maxlon) return false;
  return pointInRing(point, ring);
}

function pointInAnyShape(point, shapes) {
  return shapes.some((shape) => pointInShape(point, shape));
}

function shapeContaining(point, shapes) {
  return shapes.find((shape) => pointInShape(point, shape)) ?? null;
}

/** Lê `scripts/overpass-landuse.geojson` (export "raw data" do Overpass Turbo), ou `null` se o arquivo não existir. */
async function readLocalExport(path) {
  try {
    const raw = await readFile(path, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload.elements) ? payload.elements : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function isForestTags(tags) {
  return tags.natural === "wood" || tags.landuse === "forest";
}

function isBuildingTags(tags) {
  return tags.building != null;
}

/** Converte elementos no formato nativo da Overpass (`{tags, bounds, geometry}`) em `{ring, bounds, tags}`. */
function elementsToShapes(elements) {
  const shapes = [];
  for (const element of elements) {
    const geometry = element.geometry;
    if (!Array.isArray(geometry) || geometry.length < 3) continue;
    const ring = geometry.map((node) => [node.lon, node.lat]);
    const bounds = element.bounds ?? boundsOfRing(ring);
    shapes.push({ ring, bounds, tags: element.tags ?? {} });
  }
  return shapes;
}

function boundsOfRing(ring) {
  let minlat = Infinity;
  let minlon = Infinity;
  let maxlat = -Infinity;
  let maxlon = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minlat) minlat = lat;
    if (lat > maxlat) maxlat = lat;
    if (lng < minlon) minlon = lng;
    if (lng > maxlon) maxlon = lng;
  }
  return { minlat, minlon, maxlat, maxlon };
}

/** Busca mata/floresta/construção na Overpass API dentro de `bbox`, no mesmo formato de `scripts/overpass-landuse.geojson`. */
async function fetchLandCoverElements(box) {
  const bboxArg = `${box.south},${box.west},${box.north},${box.east}`;
  const selectors = ["way[\"natural\"=\"wood\"]", "way[\"landuse\"=\"forest\"]", "way[\"building\"]"];
  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(${selectors.map((selector) => `${selector}(${bboxArg});`).join("")});out geom;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!response.ok) throw new Error(`Overpass ${response.status} ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json();
  return Array.isArray(payload.elements) ? payload.elements : [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
