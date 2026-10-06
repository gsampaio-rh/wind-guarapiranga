import { compassLabel } from "../../domain/format";
import type { WindDay } from "../../domain/wind/series";

export function formatHour(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const minutes = Math.round(wrapped * 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function formatWindDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function formatKnots(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
  return `${text} nós`;
}

export function formatFrom(direction: number): string {
  return `de ${compassLabel(direction)}`;
}

export function formatWindSource(day: WindDay, hour: number): string {
  return `${formatWindDate(day.data)} · ${formatHour(hour)} · ${day.modelo} · arquivo Open-Meteo`;
}

export function formatCelsius(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}°C`;
}

export function formatMillimetres(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;
}

export function weatherLabel(code: number): string {
  if (code === 0) return "céu limpo";
  if (code === 1) return "quase limpo";
  if (code === 2) return "parcialmente nublado";
  if (code === 3) return "encoberto";
  if (code === 45 || code === 48) return "neblina";
  if (code >= 51 && code <= 57) return "garoa";
  if (code >= 61 && code <= 67) return "chuva";
  if (code >= 80 && code <= 82) return "pancadas";
  if (code >= 95) return "trovoada";
  return "tempo variável";
}

export function formatCellReadout(mean: number, direction: number, gust: number): string {
  return `${formatKnots(mean)} · ${formatFrom(direction)} · rajada ${formatKnots(gust)}`;
}
