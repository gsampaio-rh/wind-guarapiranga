import { readFile, writeFile } from "node:fs/promises";

// SAO PAULO - INTERLAGOS (equivalente ao A771 do apitempo, estação do INMET mais
// próxima da Guarapiranga, ~5,6 km). O apitempo.inmet.gov.br está com a rota
// horária fora do ar (confirmado: HTTP 204 até para a estação mais monitorada do
// país, A001/Brasília, em datas recentes — não é bloqueio de rede). Em vez dele,
// usamos o WIS2 (nova infraestrutura de troca de dados da OMM que o INMET expõe
// via OGC API Features), que serve os mesmos boletins SYNOP horários.
const WIGOS_ID = "0-76-0-3550308000000573";
const BASE_URL = "https://wis2bra.inmet.gov.br/oapi/collections/urn:wmo:md:br-inmet:synop/items";
const PAGE_SIZE = 500;
const KNOTS_PER_MPS = 1.943844;

const existingRaw = await readFile(new URL("../src/data/wind-days.json", import.meta.url), "utf8");
const days = JSON.parse(existingRaw);

const validation = {};
for (const day of days) {
  process.stdout.write(`WIS2/INMET Interlagos para ${day.id} (${day.data})\n`);
  const hours = await fetchLocalDay(day.data);
  if (!hours) {
    process.stdout.write(`  sem dado nessa data (fora da janela de retenção do WIS2 ou estação em manutenção)\n`);
    continue;
  }
  validation[day.id] = hours;
  process.stdout.write(`  ${hours.filter((hour) => hour).length}/24 horas com leitura\n`);
}

await writeFile(
  new URL("../src/data/wind-validation.json", import.meta.url),
  `${JSON.stringify(validation, null, 2)}\n`,
);
process.stdout.write(`dias com validação INMET: ${Object.keys(validation).length}/${days.length}\n`);
if (Object.keys(validation).length === 0) {
  process.stdout.write(
    "Aviso: nenhuma das datas do catálogo caiu dentro da janela de retenção do WIS2 (~2 meses).\n" +
      "O toggle 'Comparar com INMET' vai mostrar 'sem leitura' até alguma data do catálogo cair nessa janela.\n",
  );
}

async function fetchLocalDay(isoDate) {
  const features = await fetchAllFeatures(isoDate);
  if (features.length === 0) return null;

  const bucket = Array.from({ length: 24 }, () => ({ speed: null, direction: null, gust: null }));
  for (const feature of features) {
    const { name, value, phenomenonTime, units } = feature.properties;
    if (value == null || !Number.isFinite(value)) continue;
    const instant = phenomenonTime.split("/")[0];
    const utcHour = Number(instant.slice(11, 13));
    const utcDate = instant.slice(0, 10);
    if (!Number.isFinite(utcHour)) continue;

    const localHour = utcHour >= 3 ? utcHour - 3 : utcHour + 21;
    const localDate = utcHour >= 3 ? utcDate : addDays(utcDate, -1);
    if (localDate !== isoDate) continue;

    const mps = units === "km/h" ? value / 3.6 : value;
    if (name === "wind_speed") bucket[localHour].speed = mps;
    else if (name === "wind_direction") bucket[localHour].direction = value;
    else if (name === "maximum_wind_gust_speed") bucket[localHour].gust = mps;
  }

  const hours = bucket.map((slot) => {
    if (slot.speed == null || slot.direction == null) return null;
    return {
      velocidade: Math.round(slot.speed * KNOTS_PER_MPS * 10) / 10,
      direcao: Math.round(slot.direction) % 360,
      rajada: Math.round((slot.gust ?? slot.speed) * KNOTS_PER_MPS * 10) / 10,
    };
  });
  return hours.some((hour) => hour != null) ? hours : null;
}

async function fetchAllFeatures(isoDate) {
  const start = `${isoDate}T00:00:00Z`;
  const end = `${isoDate}T23:59:59Z`;
  const features = [];
  let offset = 0;
  for (;;) {
    const url = new URL(BASE_URL);
    url.searchParams.set("f", "json");
    url.searchParams.set("wigos_station_identifier", WIGOS_ID);
    url.searchParams.set("datetime", `${start}/${end}`);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    const payload = await response.json();
    features.push(...payload.features);
    offset += payload.numberReturned ?? 0;
    if (offset >= (payload.numberMatched ?? 0) || payload.numberReturned === 0) break;
  }
  return features;
}

function addDays(isoDate, delta) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
