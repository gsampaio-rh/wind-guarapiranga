import rawDays from "../../data/wind-days.json";
import { wrapDegrees } from "../geo";
import { VIEWPOINTS } from "../viewpoints";
import { type WindHour } from "./catalog";

export type { WindHour };

const STATION_IDS = ["barragem", "amores", "sul"] as const;
export type StationId = (typeof STATION_IDS)[number];

export const WIND_STATIONS = STATION_IDS.map((id) => {
  const view = VIEWPOINTS.find((item) => item.id === id);
  if (!view) throw new Error(`Ponto ausente: ${id}`);
  return { id, lng: view.lng, lat: view.lat };
});

export type WindDay = {
  id: string;
  nome: string;
  data: string;
  modelo: string;
  horas?: WindHour[];
  pontos?: Partial<Record<StationId, WindHour[]>>;
};

export type WindVector = {
  u: number;
  v: number;
  velocidade: number;
  direcao: number;
  rajada: number;
};

export const WIND_DAYS = rawDays as WindDay[];

export function meteoToUv(speed: number, directionDeg: number): { u: number; v: number } {
  const rad = (directionDeg * Math.PI) / 180;
  return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) };
}

export function uvToMeteo(u: number, v: number): { velocidade: number; direcao: number } {
  const velocidade = Math.hypot(u, v);
  if (velocidade === 0) return { velocidade: 0, direcao: 0 };
  return { velocidade, direcao: wrapDegrees((Math.atan2(-u, -v) * 180) / Math.PI) };
}

export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function interpolateUv(a: WindHour, b: WindHour, t: number): WindVector {
  const from = meteoToUv(a.velocidade, a.direcao);
  const to = meteoToUv(b.velocidade, b.direcao);
  const u = from.u + (to.u - from.u) * t;
  const v = from.v + (to.v - from.v) * t;
  const meteo = uvToMeteo(u, v);
  return {
    u,
    v,
    velocidade: meteo.velocidade,
    direcao: meteo.direcao,
    rajada: a.rajada + (b.rajada - a.rajada) * t,
  };
}

export function interpolateSeries(hours: WindHour[], hour: number): WindVector {
  const wrapped = ((hour % 24) + 24) % 24;
  const base = Math.floor(wrapped + 1e-8) % 24;
  const fraction = wrapped - Math.floor(wrapped + 1e-8);
  const current = hours[base];
  const next = hours[(base + 1) % 24];
  if (!current || !next) throw new Error("Série horária incompleta");
  if (fraction < 1e-6) {
    const uv = meteoToUv(current.velocidade, current.direcao);
    return { ...uv, velocidade: current.velocidade, direcao: current.direcao, rajada: current.rajada };
  }
  return interpolateUv(current, next, fraction);
}

export type HourWeather = {
  temperatura: number;
  umidade: number;
  nuvens: number;
  chuva: number;
  codigo: number;
};

export function sampleWeather(day: WindDay, hour: number): HourWeather | null {
  const hours = day.horas ?? day.pontos?.amores;
  const current = hours ? hourAt(hours, hour) : null;
  if (!current || current.hour.temperatura == null) return null;
  const next = hours?.[(current.index + 1) % 24];
  const t = current.fraction;
  const mix = (left?: number, right?: number) => (left ?? 0) + ((right ?? left ?? 0) - (left ?? 0)) * t;
  const code = t < 0.5 ? current.hour.codigo : next?.codigo;
  return {
    temperatura: mix(current.hour.temperatura, next?.temperatura),
    umidade: mix(current.hour.umidade, next?.umidade),
    nuvens: mix(current.hour.nuvens, next?.nuvens),
    chuva: mix(current.hour.chuva, next?.chuva),
    codigo: code ?? 0,
  };
}

function hourAt(hours: WindHour[], hour: number): { hour: WindHour; index: number; fraction: number } | null {
  const wrapped = ((hour % 24) + 24) % 24;
  const index = Math.floor(wrapped + 1e-8) % 24;
  const fraction = wrapped - Math.floor(wrapped + 1e-8);
  const item = hours[index];
  if (!item) return null;
  return { hour: item, index, fraction: fraction < 1e-6 ? 0 : fraction };
}

export function sampleSeries(day: WindDay, hour: number, lng = WIND_STATIONS[0]?.lng ?? 0, lat = WIND_STATIONS[0]?.lat ?? 0): WindVector {
  if (day.horas) return interpolateSeries(day.horas, hour);
  const pontos = day.pontos;
  if (!pontos) throw new Error(`Dia sem série: ${day.id}`);
  const samples = WIND_STATIONS.map((station) => {
    const hours = pontos[station.id];
    if (!hours) throw new Error(`Série ausente em ${station.id}`);
    return { station, sample: interpolateSeries(hours, hour) };
  });
  let nearest = samples[0];
  if (!nearest) throw new Error(`Dia sem série: ${day.id}`);
  for (const item of samples) {
    const distance = Math.hypot(item.station.lng - lng, item.station.lat - lat);
    if (distance < 1e-5) return item.sample;
    if (distance < Math.hypot(nearest.station.lng - lng, nearest.station.lat - lat)) nearest = item;
  }
  let weight = 0;
  let u = 0;
  let v = 0;
  let gust = 0;
  for (const item of samples) {
    const distance = Math.max(1, Math.hypot(item.station.lng - lng, item.station.lat - lat));
    const w = 1 / (distance * distance);
    weight += w;
    u += item.sample.u * w;
    v += item.sample.v * w;
    gust += item.sample.rajada * w;
  }
  const meteo = uvToMeteo(u / weight, v / weight);
  return { u: u / weight, v: v / weight, velocidade: meteo.velocidade, direcao: meteo.direcao, rajada: gust / weight };
}

export function extremeHour(hours: WindHour[], key: "velocidade" | "rajada"): { index: number; value: number } {
  let index = 0;
  let value = hours[0]?.[key] ?? 0;
  hours.forEach((item, itemIndex) => {
    const next = item[key];
    if (next > value) {
      value = next;
      index = itemIndex;
    }
  });
  return { index, value };
}
