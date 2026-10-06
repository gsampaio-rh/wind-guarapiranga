import { wrapDegrees } from "./geo";

const COMPASS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"] as const;

export function compassLabel(bearing: number): string {
  const index = Math.round(wrapDegrees(bearing) / 45) % 8;
  return COMPASS[index] ?? "N";
}

export function formatCoord(lat: number, lng: number): string {
  const ns = lat < 0 ? "S" : "N";
  const ew = lng < 0 ? "O" : "L";
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lng).toFixed(4)}°${ew}`;
}

export function formatAltitude(meters: number): string {
  return `alt. ${Math.round(meters).toLocaleString("pt-BR")} m`;
}

export function formatRelief(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}×`;
}
