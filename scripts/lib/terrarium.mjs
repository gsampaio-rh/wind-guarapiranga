import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

/**
 * Amostra elevação (m) direto dos tiles AWS Terrain Tiles (formato Terrarium,
 * Mapzen/Tilezen) — o MESMO DEM que `src/map/mapStyle.ts` já usa pro relevo 3D
 * do app (`demSource()`). Tiles estáticos no S3 — sem cota de chamadas por
 * hora/dia como a API de elevação do Open-Meteo (usada antes em
 * `build-orographic-grid.mjs`, trocada por isso justamente pelo limite).
 *
 * Decodificação Terrarium: elevação = (R·256 + G + B/256) − 32768.
 * https://github.com/tilezen/joerd/blob/master/docs/formats.md
 */

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TILE_SIZE = 256;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TILE_CACHE_DIR = `${SCRIPT_DIR}/../.cache/terrarium-tiles`;

function lngLatToTilePixel(lng, lat, zoom) {
  const scale = 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const pixelX = Math.min(TILE_SIZE - 1, Math.floor((x - tileX) * TILE_SIZE));
  const pixelY = Math.min(TILE_SIZE - 1, Math.floor((y - tileY) * TILE_SIZE));
  return { tileX, tileY, pixelX, pixelY };
}

function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

export function createElevationSampler(zoom = 14) {
  const tiles = new Map();

  async function loadTile(tileX, tileY) {
    const key = `${zoom}/${tileX}/${tileY}`;
    const cached = tiles.get(key);
    if (cached) return cached;
    const promise = fetchAndDecodeTile(tileX, tileY);
    tiles.set(key, promise);
    return promise;
  }

  async function fetchAndDecodeTile(tileX, tileY) {
    const cachePath = `${TILE_CACHE_DIR}/${zoom}-${tileX}-${tileY}.png`;
    let buffer;
    if (existsSync(cachePath)) {
      buffer = readFileSync(cachePath);
    } else {
      const response = await fetch(TILE_URL(zoom, tileX, tileY));
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
      mkdirSync(TILE_CACHE_DIR, { recursive: true });
      writeFileSync(cachePath, buffer);
    }
    return new Promise((resolve, reject) => {
      new PNG().parse(buffer, (error, png) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(png);
      });
    });
  }

  return {
    /** Elevação (m) no ponto, ou `null` se o tile não existir (fora de cobertura). */
    async sample(lng, lat) {
      const { tileX, tileY, pixelX, pixelY } = lngLatToTilePixel(lng, lat, zoom);
      const png = await loadTile(tileX, tileY);
      if (!png) return null;
      const index = (pixelY * png.width + pixelX) * 4;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      if (r == null || g == null || b == null) return null;
      return decodeTerrarium(r, g, b);
    },
    tileCount() {
      return tiles.size;
    },
  };
}

/** Roda `tasks` com no máximo `limit` promessas em paralelo, preservando a ordem dos resultados. */
export async function runWithConcurrency(tasks, limit) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      await tasks[index]();
      done += 1;
      if (done % 1000 === 0) process.stdout.write(`  ${done}/${tasks.length}\n`);
    }
  });
  await Promise.all(workers);
}
