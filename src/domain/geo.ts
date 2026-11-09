export const EARTH_RADIUS_M = 6_378_137;

export const BOUNDS = {
  west: -46.86,
  east: -46.62,
  south: -23.84,
  north: -23.62,
} as const;

export function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function offsetMeters(
  lng: number,
  lat: number,
  eastM: number,
  northM: number,
): { lng: number; lat: number } {
  const latRad = (lat * Math.PI) / 180;
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos(latRad);
  const dLng = cosLat === 0 ? 0 : (eastM / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

export function distanceMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const north = ((bLat - aLat) * Math.PI) / 180 * EARTH_RADIUS_M;
  const east = ((bLng - aLng) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(east, north);
}

/** Mesmo cálculo de `distanceMeters`, mas devolve as componentes leste/norte (m) em vez só da distância total. */
export function eastNorthMeters(aLng: number, aLat: number, bLng: number, bLat: number): { east: number; north: number } {
  const north = ((bLat - aLat) * Math.PI) / 180 * EARTH_RADIUS_M;
  const east = ((bLng - aLng) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos((aLat * Math.PI) / 180);
  return { east, north };
}

/** Rotates a (u, v) vector clockwise by `angleDeg` (compass sense), preserving its magnitude. */
export function rotateClockwise(u: number, v: number, angleDeg: number): { u: number; v: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { u: u * cos + v * sin, v: v * cos - u * sin };
}

export function clampLngLat(lng: number, lat: number): { lng: number; lat: number } {
  return {
    lng: clamp(lng, BOUNDS.west, BOUNDS.east),
    lat: clamp(lat, BOUNDS.south, BOUNDS.north),
  };
}

export function raiseToClearance(altitude: number, ground: number | null, clearance: number): number {
  if (ground == null || !Number.isFinite(ground)) return altitude;
  return Math.max(altitude, ground + clearance);
}

export type BoundsGrid = {
  cols: number;
  rows: number;
  spacingM: number;
  west: number;
  south: number;
  east: number;
  north: number;
};

export function boundsGrid(spacingM = 400): BoundsGrid {
  const width = distanceMeters(BOUNDS.west, BOUNDS.south, BOUNDS.east, BOUNDS.south);
  const height = distanceMeters(BOUNDS.west, BOUNDS.south, BOUNDS.west, BOUNDS.north);
  const cols = Math.max(2, Math.round(width / spacingM));
  const rows = Math.max(2, Math.round(height / spacingM));
  return {
    cols,
    rows,
    spacingM: (width / cols + height / rows) / 2,
    west: BOUNDS.west,
    south: BOUNDS.south,
    east: BOUNDS.east,
    north: BOUNDS.north,
  };
}

export function gridCenter(grid: BoundsGrid, col: number, row: number): { lng: number; lat: number } {
  return {
    lng: grid.west + ((grid.east - grid.west) * (col + 0.5)) / grid.cols,
    lat: grid.south + ((grid.north - grid.south) * (row + 0.5)) / grid.rows,
  };
}

export function gridCell(grid: BoundsGrid, col: number, row: number): { west: number; east: number; south: number; north: number } {
  const dLng = (grid.east - grid.west) / grid.cols;
  const dLat = (grid.north - grid.south) / grid.rows;
  return {
    west: grid.west + col * dLng,
    east: grid.west + (col + 1) * dLng,
    south: grid.south + row * dLat,
    north: grid.south + (row + 1) * dLat,
  };
}

export function gridColumnRow(grid: BoundsGrid, lng: number, lat: number): { col: number; row: number } {
  return {
    col: Math.floor(((lng - grid.west) / (grid.east - grid.west)) * grid.cols),
    row: Math.floor(((lat - grid.south) / (grid.north - grid.south)) * grid.rows),
  };
}

/** Pontos por passada usado em todo lugar que suaviza o contorno de `water.json` (desenho e física). */
export const SHORE_SPLINE_SAMPLES = 12;

function lerpPoint(a: number[], b: number[], t: number): number[] {
  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/**
 * Suaviza um anel fechado (primeiro ponto === último) com uma spline de Catmull-Rom
 * centrípeta: diferente de um corte de canto (Chaikin), ela usa os dois vizinhos de
 * cada lado pra curvar também os trechos já retos entre vértices espaçados — não só
 * arredondar os cantos. `samplesPerSegment` pontos novos por aresta original.
 */
export function smoothRingCatmullRom(ring: number[][], samplesPerSegment: number): number[][] {
  if (ring.length < 5 || samplesPerSegment < 1) return ring;
  const points = ring.slice(0, -1);
  const n = points.length;
  const out: number[][] = [];
  const alpha = 0.5;
  for (let index = 0; index < n; index += 1) {
    const p0 = points[(index - 1 + n) % n];
    const p1 = points[index];
    const p2 = points[(index + 1) % n];
    const p3 = points[(index + 2) % n];
    if (!p0 || !p1 || !p2 || !p3) continue;
    const t0 = 0;
    const t1 = t0 + Math.pow(distanceDeg(p0, p1) || 1e-9, alpha);
    const t2 = t1 + Math.pow(distanceDeg(p1, p2) || 1e-9, alpha);
    const t3 = t2 + Math.pow(distanceDeg(p2, p3) || 1e-9, alpha);
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = t1 + ((t2 - t1) * sample) / samplesPerSegment;
      const a1 = lerpPoint(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerpPoint(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerpPoint(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerpPoint(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerpPoint(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerpPoint(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  const first = out[0];
  if (first) out.push(first);
  return out;
}

function distanceDeg(a: number[], b: number[]): number {
  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  return Math.hypot(bx - ax, by - ay);
}

/** Aplica `smoothRingCatmullRom` a cada anel (externo + buracos) de um polígono. */
export function smoothPolygonRings(rings: number[][][], samplesPerSegment: number): number[][][] {
  return rings.map((ring) => smoothRingCatmullRom(ring, samplesPerSegment));
}
