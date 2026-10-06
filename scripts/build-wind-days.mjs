import { writeFile } from "node:fs/promises";
import { VIEWPOINTS } from "../src/viewpoints.ts";
import { WIND_KINDS, isSaturday } from "../src/windCatalog.ts";

const STATION_IDS = ["barragem", "amores", "sul"];
const MODEL = "era5";
const WINDOW_START = "2010-01-01";
const WINDOW_END = "2026-10-03";

const stations = STATION_IDS.map((id) => {
  const view = VIEWPOINTS.find((item) => item.id === id);
  if (!view) throw new Error(`Ponto ausente: ${id}`);
  return { id, lat: view.lat, lng: view.lng };
});

if (!isSaturday("2026-10-03")) throw new Error("3 de outubro de 2026 deveria ser sábado em America/Sao_Paulo");

const days = new Map();

for (const [start, end] of chunks(WINDOW_START, WINDOW_END, 2)) {
  process.stdout.write(`buscando ${start} → ${end}\n`);
  const payload = await fetchChunk(start, end);
  if (!Array.isArray(payload) || payload.length !== stations.length) {
    throw new Error(`Resposta inesperada em ${start}: ${payload.length ?? "objeto"}`);
  }
  const grouped = payload.map((location) => groupHours(location.hourly));
  for (const date of grouped[0].keys()) {
    if (!isSaturday(date)) continue;
    const series = grouped.map((table) => table.get(date));
    if (series.some((item) => !item)) continue;
    days.set(date, series);
  }
}

const catalog = [];
for (const kind of WIND_KINDS) {
  const date = [...days.keys()].sort().reverse().find((iso) => {
    const series = days.get(iso);
    return series.every((hours) => kind.test(hours));
  });
  if (!date) {
    process.stdout.write(`omitido ${kind.id}\n`);
    continue;
  }
  const series = days.get(date);
  const regional = series.every((hours) => JSON.stringify(hours) === JSON.stringify(series[0]));
  const entry = {
    id: kind.id,
    nome: kind.nome,
    data: date,
    modelo: MODEL,
  };
  if (regional) entry.horas = series[0];
  else {
    entry.pontos = {};
    stations.forEach((station, index) => {
      entry.pontos[station.id] = series[index];
    });
  }
  catalog.push(entry);
  const peak = Math.max(...series.flat().map((hour) => hour.velocidade));
  process.stdout.write(`${kind.id} ${date} regional=${regional} pico=${peak}\n`);
}

await writeFile(new URL("../src/data/wind-days.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`sábados consultados: ${days.size}\n`);

function chunks(start, end, years) {
  const list = [];
  let cursor = start;
  while (cursor <= end) {
    const year = Number(cursor.slice(0, 4)) + years - 1;
    const chunkEnd = `${year}-12-31` < end ? `${year}-12-31` : end;
    list.push([cursor, chunkEnd]);
    cursor = `${year + 1}-01-01`;
  }
  return list;
}

async function fetchChunk(start, end) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", stations.map((station) => station.lat).join(","));
  url.searchParams.set("longitude", stations.map((station) => station.lng).join(","));
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);
  url.searchParams.set(
    "hourly",
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,relative_humidity_2m,cloud_cover,precipitation,weather_code",
  );
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "America/Sao_Paulo");
  url.searchParams.set("models", MODEL);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${start} ${response.status} ${(await response.text()).slice(0, 280)}`);
  return response.json();
}

function groupHours(hourly) {
  const table = new Map();
  for (let index = 0; index < hourly.time.length; index += 1) {
    const stamp = hourly.time[index];
    const speed = hourly.wind_speed_10m[index];
    const direction = hourly.wind_direction_10m[index];
    const gust = hourly.wind_gusts_10m[index];
    if (speed == null || direction == null || gust == null) continue;
    const date = stamp.slice(0, 10);
    const hour = Number(stamp.slice(11, 13));
    const bucket = table.get(date) ?? Array.from({ length: 24 }, () => null);
    const hourRecord = {
      velocidade: Math.round(speed * 10) / 10,
      direcao: Math.round(direction) % 360,
      rajada: Math.round(gust * 10) / 10,
    };
    if (hourly.temperature_2m) {
      hourRecord.temperatura = Math.round(hourly.temperature_2m[index] * 10) / 10;
      hourRecord.umidade = Math.round(hourly.relative_humidity_2m[index]);
      hourRecord.nuvens = Math.round(hourly.cloud_cover[index]);
      hourRecord.chuva = Math.round(hourly.precipitation[index] * 10) / 10;
      hourRecord.codigo = hourly.weather_code[index];
    }
    bucket[hour] = hourRecord;
    table.set(date, bucket);
  }
  const complete = new Map();
  for (const [date, bucket] of table) {
    if (bucket.every((hour) => hour)) complete.set(date, bucket);
  }
  return complete;
}
