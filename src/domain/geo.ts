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
