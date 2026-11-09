import { readFile, writeFile } from "node:fs/promises";
import { VIEWPOINTS } from "../src/domain/viewpoints.ts";
import { WIND_KINDS } from "../src/domain/wind/catalog.ts";

const STATION_IDS = ["barragem", "amores", "sul"];
const MODEL = "best_match";

const stations = STATION_IDS.map((id) => {
  const view = VIEWPOINTS.find((item) => item.id === id);
  if (!view) throw new Error(`Ponto ausente: ${id}`);
  return { id, lat: view.lat, lng: view.lng };
});

const existingRaw = await readFile(new URL("../src/data/wind-days.json", import.meta.url), "utf8");
const existingDays = JSON.parse(existingRaw);

const catalog = [];
for (const day of existingDays) {
  process.stdout.write(`buscando ${day.id} (${day.data})\n`);
  const payload = await fetchDay(day.data);
  if (!Array.isArray(payload) || payload.length !== stations.length) {
    throw new Error(`Resposta inesperada em ${day.id}: ${payload.length ?? "objeto"}`);
  }
  const series = payload.map((location) => hoursFrom(location.hourly));
  if (series.some((hours) => hours.some((hour) => !hour))) {
    process.stdout.write(`omitido ${day.id}: série incompleta no modelo ${MODEL}\n`);
    continue;
  }
  const regional = series.every((hours) => JSON.stringify(hours) === JSON.stringify(series[0]));
  const kind = WIND_KINDS.find((item) => item.id === day.id);
  const entry = { id: day.id, nome: kind?.nome ?? day.nome, data: day.data, modelo: MODEL };
  if (regional) entry.horas = series[0];
  else {
    entry.pontos = {};
    stations.forEach((station, index) => {
      entry.pontos[station.id] = series[index];
    });
  }
  catalog.push(entry);
  const peak = Math.max(...series.flat().map((hour) => hour.velocidade));
  process.stdout.write(`${day.id} regional=${regional} pico=${peak}\n`);
}

await writeFile(new URL("../src/data/wind-days-hires.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`dias gerados: ${catalog.length}/${existingDays.length}\n`);

async function fetchDay(date) {
  const url = new URL("https://historical-forecast-api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", stations.map((station) => station.lat).join(","));
  url.searchParams.set("longitude", stations.map((station) => station.lng).join(","));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "America/Sao_Paulo");
  url.searchParams.set("models", MODEL);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${date} ${response.status} ${(await response.text()).slice(0, 280)}`);
  return response.json();
}

function hoursFrom(hourly) {
  const bucket = Array.from({ length: 24 }, () => null);
  for (let index = 0; index < hourly.time.length; index += 1) {
    const speed = hourly.wind_speed_10m[index];
    const direction = hourly.wind_direction_10m[index];
    const gust = hourly.wind_gusts_10m[index];
    if (speed == null || direction == null || gust == null) continue;
    const hour = Number(hourly.time[index].slice(11, 13));
    bucket[hour] = {
      velocidade: Math.round(speed * 10) / 10,
      direcao: Math.round(direction) % 360,
      rajada: Math.round(gust * 10) / 10,
    };
  }
  return bucket;
}
