import type { Map as MapView } from "maplibre-gl";
import curvatureData from "../../data/curvature-grid.json";
import orographicData from "../../data/orographic-grid.json";
import roughnessData from "../../data/roughness-grid.json";
import water from "../../data/water.json";
import { boundsGrid, clamp, eastNorthMeters, gridCenter, gridColumnRow, rotateClockwise } from "../../domain/geo";
import { inReservoir, waterCellsOf, waterMask } from "../../domain/water";
import { curvatureFactorAt, type CurvatureGrid } from "../../domain/wind/curvature";
import { breezeMagnitudeKt, breezeVector, heatingProgress, nearestShoreProximity, windSuppression, type ShoreProximity } from "../../domain/wind/lakeBreeze";
import { deflectionAngle, orographicFactorAt, type OrographicGrid } from "../../domain/wind/orographic";
import { roughnessFactorAt, type RoughnessGrid } from "../../domain/wind/roughness";
import { WIND_DAYS, dayTemperatureRange, hiresDayFor, sampleSeries, sampleWeather, validationHoursFor, type WindDay } from "../../domain/wind/series";
import { required } from "../dom";
import { paintDayChart } from "./chart";
import { DEFAULT_FLAGS, MODEL_FLAG_BUTTONS, type ModelFlagId, type WindModelFlags } from "./flags";
import { formatCellReadout, formatHour, formatWindSource } from "./format";
import { mountDayPicker, renderDayPanel, type DayPanelElements } from "./panel";
import { createParticleCanvas, type WindSample } from "./particles";

const HOURS_PER_SECOND = 1;
const SPEEDS = [1, 2, 4, 8];

const RINGS = water.geometry.coordinates;
const GRID = boundsGrid();
const OROGRAPHIC_GRID = orographicData as OrographicGrid;
const CURVATURE_GRID = curvatureData as CurvatureGrid;
const ROUGHNESS_GRID = roughnessData as RoughnessGrid;
const MAX_COMBINED_DEFLECTION_DEG = 18;
/** Ícones movidos pro dock, controlados pelo botão mestre `#model-all` — INMET e densidade adaptativa ficam no painel lateral. */
const ICON_TOGGLE_IDS: ModelFlagId[] = ["hiresSource", "orographic", "waterFetch", "shoreCurvature", "shoreRoughness", "lakeBreeze"];

type LngLat = { lng: number; lat: number };

export function attachWind(map: MapView): { frame(dt: number): void; resize(): void } {
  const canvas = required<HTMLCanvasElement>("#wind-canvas");
  const gl = canvas.getContext("2d");
  if (!gl) throw new Error("Canvas do vento indisponível");
  const ctx: CanvasRenderingContext2D = gl;
  const dayBox = required<HTMLElement>("#wind-days");
  const play = required<HTMLButtonElement>("#wind-play");
  const speedButton = required<HTMLButtonElement>("#wind-speed");
  const hourInput = required<HTMLInputElement>("#wind-hour");
  const hourValue = required<HTMLElement>("#wind-hour-value");
  const source = required<HTMLElement>("#wind-source");
  const cellReadout = required<HTMLElement>("#wind-cell");
  const particleButton = required<HTMLButtonElement>("#wind-particles");
  const dayChart = required<HTMLCanvasElement>("#day-chart");

  const panelElements: DayPanelElements = {
    dayName: required("#day-name"),
    dayWhen: required("#day-when"),
    dayWind: required("#day-wind"),
    dayWindInmet: required("#day-wind-inmet"),
    dayDir: required("#day-dir"),
    dayGust: required("#day-gust"),
    dayTemp: required("#day-temp"),
    dayRh: required("#day-rh"),
    dayCloud: required("#day-cloud"),
    dayRain: required("#day-rain"),
    daySky: required("#day-sky"),
    dayPeak: required("#day-peak"),
    dayPeakGust: required("#day-peak-gust"),
    dayTempRange: required("#day-temp-range"),
    dayRainSum: required("#day-rain-sum"),
    dayField: required("#day-field"),
    dayChart,
    windStatus: required("#wind-status"),
    windStatusReadout: required("#wind-status-readout"),
    flowNote: required("#flow-note"),
  };

  const mask = waterMask(GRID, RINGS, (col, row) => gridCenter(GRID, col, row));
  const waterCells = waterCellsOf(GRID, mask);
  const particles = createParticleCanvas(map, canvas, ctx, RINGS, GRID, waterCells);
  const shoreGrid = buildShoreGrid(waterCells);

  let day = WIND_DAYS[0];
  if (!day) throw new Error("Catálogo de vento vazio");
  let hour = 15;
  let playing = false;
  let speed = 1;
  let simDt = 0;
  let gustsOn = false;
  let particlesOn = true;
  let pointer: { x: number; y: number } | null = null;
  const flags: WindModelFlags = { ...DEFAULT_FLAGS };

  const elementIdById = new Map(MODEL_FLAG_BUTTONS.map(({ id, elementId }) => [id, elementId]));
  const modelAllButton = document.querySelector<HTMLButtonElement>("#model-all");

  for (const { id, elementId } of MODEL_FLAG_BUTTONS) {
    const button = document.querySelector<HTMLButtonElement>(`#${elementId}`);
    if (!button) continue;
    button.addEventListener("click", () => {
      flags[id] = !flags[id];
      button.setAttribute("aria-pressed", String(flags[id]));
      if (ICON_TOGGLE_IDS.includes(id)) syncGustsFromFlags();
      syncModelAllButton();
      onModelFlagsChanged();
      renderDay();
    });
  }

  modelAllButton?.addEventListener("click", () => {
    const allOn = ICON_TOGGLE_IDS.every((id) => flags[id]);
    const next = !allOn;
    for (const id of ICON_TOGGLE_IDS) {
      flags[id] = next;
      const target = document.querySelector<HTMLButtonElement>(`#${elementIdById.get(id)}`);
      target?.setAttribute("aria-pressed", String(next));
    }
    syncGustsFromFlags();
    syncModelAllButton();
    onModelFlagsChanged();
    renderDay();
  });

  function syncModelAllButton(): void {
    if (!modelAllButton) return;
    modelAllButton.setAttribute("aria-pressed", String(ICON_TOGGLE_IDS.every((id) => flags[id])));
  }

  mountDayPicker(dayBox, WIND_DAYS, day.id, (next) => {
    day = next;
    syncHour(false);
  });
  syncHour(false);

  play.addEventListener("click", () => {
    playing = !playing;
    play.setAttribute("aria-pressed", String(playing));
    play.setAttribute("aria-label", playing ? "Pausar o dia" : "Tocar o dia");
  });
  speedButton.addEventListener("click", () => {
    const index = SPEEDS.indexOf(speed);
    speed = SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
    speedButton.textContent = `${speed}×`;
    speedButton.setAttribute("aria-label", speed === 1 ? "Velocidade 1 vez" : `Velocidade ${speed} vezes`);
  });
  particleButton.addEventListener("click", () => {
    cycleParticleMode();
  });
  syncParticleButton();
  dayChart.addEventListener("pointerdown", (event) => pickChartHour(event.clientX));
  dayChart.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    pausePlayback();
    shiftHour(event.key === "ArrowRight" ? 1 : -1);
  });
  hourInput.addEventListener("input", () => {
    pausePlayback();
    syncHour(true);
  });
  map.getContainer().addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
  });
  map.getContainer().addEventListener("pointerup", (event) => {
    if (!pointer || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = null;
    if (moved > 6) return;
    if (event.target instanceof Element && event.target.closest(".maplibregl-ctrl, button, a")) return;
    const point = unproject(event);
    const sample = windAt(point.lng, point.lat);
    if (!sample) {
      cellReadout.textContent = "Clique na água para ler a célula.";
      return;
    }
    const { col, row } = gridColumnRow(GRID, point.lng, point.lat);
    const factor = orographicFactorFor(col, row, sample.direction);
    const curvature = curvatureFactorFor(col, row, sample.direction);
    const roughness = roughnessFactorFor(col, row, sample.direction);
    const factorNote = flags.orographic ? ` · fator orográfico ${factor.toFixed(2)}×` : "";
    const curvatureNote = flags.shoreCurvature ? ` · fator de curvatura ${curvature.toFixed(2)}×` : "";
    const roughnessNote = flags.shoreRoughness ? ` · fator de rugosidade ${roughness.toFixed(2)}×` : "";
    const breezeNote = flags.lakeBreeze ? ` · brisa de lago (estimativa) +${(sample.breeze ?? 0).toFixed(1)} nós` : "";
    cellReadout.textContent = `${formatCellReadout(sample.mean, sample.direction, sample.gust)}${factorNote}${curvatureNote}${roughnessNote}${breezeNote}`;
  });

  return {
    frame(dt: number) {
      simDt = Math.min(Math.max(dt, 0), 0.05);
      if (playing) {
        hour = (hour + simDt * HOURS_PER_SECOND * speed + 24) % 24;
        syncHour(false);
      }
      draw();
    },
    resize() {
      particles.resize();
      renderDay();
      draw();
    },
  };

  function syncHour(fromSlider: boolean): void {
    if (fromSlider) hour = Number(hourInput.value);
    hour = ((hour % 24) + 24) % 24;
    hourInput.value = String(hour);
    hourValue.textContent = formatHour(hour);
    hourInput.setAttribute("aria-valuetext", formatHour(hour));
    source.textContent = formatWindSource(activeDay(), hour);
    renderDay();
  }

  function pausePlayback(): void {
    playing = false;
    play.setAttribute("aria-pressed", "false");
    play.setAttribute("aria-label", "Tocar o dia");
  }

  function pickChartHour(clientX: number): void {
    const rect = dayChart.getBoundingClientRect();
    if (rect.width <= 0) return;
    pausePlayback();
    hour = Math.min(23.999, Math.max(0, ((clientX - rect.left) / rect.width) * 24));
    syncHour(false);
  }

  function shiftHour(delta: number): void {
    hour = (hour + delta + 24) % 24;
    syncHour(false);
  }

  function draw(): void {
    if (!map.isStyleLoaded()) return;
    particles.step(
      simDt || 0.016,
      windAt,
      gustsOn,
      flags.waterFetch,
      flags.shoreCurvature,
      flags.shoreRoughness,
      flags.adaptiveDensity,
    );
    particles.draw(particlesOn);
  }

  function windAt(lng: number, lat: number): WindSample | null {
    if (!onWater({ lng, lat })) return null;
    const regional = sampleSeries(activeDay(), hour, lng, lat);
    const { col, row } = gridColumnRow(GRID, lng, lat);
    const terrainFactor = orographicFactorFor(col, row, regional.direcao);
    const curvatureFactor = curvatureFactorFor(col, row, regional.direcao);
    const roughnessFactor = roughnessFactorFor(col, row, regional.direcao);
    const combinedFactor = terrainFactor * curvatureFactor * roughnessFactor;
    const deflection = clamp(
      orographicDeflectionFor(col, row, regional.direcao) + curvatureDeflectionFor(col, row, regional.direcao),
      -MAX_COMBINED_DEFLECTION_DEG,
      MAX_COMBINED_DEFLECTION_DEG,
    );
    const { u, v } = rotateClockwise(regional.u * combinedFactor, regional.v * combinedFactor, deflection);
    const weather = sampleWeather(activeDay(), hour);
    const mean = regional.velocidade * combinedFactor;
    const breeze = lakeBreezeFor(col, row, mean, weather?.temperatura);
    return {
      u: u + breeze.u,
      v: v + breeze.v,
      mean: mean + breeze.magnitude,
      gust: regional.rajada * combinedFactor + breeze.magnitude,
      direction: regional.direcao,
      terrain: terrainFactor,
      curvature: curvatureFactor,
      roughness: roughnessFactor,
      rain: weather?.chuva ?? 0,
      breeze: breeze.magnitude,
    };
  }

  /** F3: fator de aceleração/abrigo pelo terreno a montante, 1 (neutro) se o toggle estiver desligado. */
  function orographicFactorFor(col: number, row: number, directionDeg: number): number {
    if (!flags.orographic) return 1;
    return orographicFactorAt(OROGRAPHIC_GRID, col, row, directionDeg);
  }

  /** F7: fator de aceleração/abrigo por curvatura da margem, 1 (neutro) se o toggle estiver desligado. */
  function curvatureFactorFor(col: number, row: number, directionDeg: number): number {
    if (!flags.shoreCurvature) return 1;
    return curvatureFactorAt(CURVATURE_GRID, col, row, directionDeg);
  }

  /** F12: fator de aceleração/abrigo pela rugosidade da margem (OSM), 1 (neutro) se o toggle estiver desligado. */
  function roughnessFactorFor(col: number, row: number, directionDeg: number): number {
    if (!flags.shoreRoughness) return 1;
    return roughnessFactorAt(ROUGHNESS_GRID, col, row, directionDeg);
  }

  /**
   * F11: vetor da brisa de lago (água→terra), vetor zero se o toggle estiver desligado,
   * sem dado de temperatura da hora, ou sem amplitude térmica no dia (estimativa, não medição).
   */
  function lakeBreezeFor(col: number, row: number, meanWindKt: number, temperatureC: number | undefined): { u: number; v: number; magnitude: number } {
    if (!flags.lakeBreeze || temperatureC == null) return { u: 0, v: 0, magnitude: 0 };
    const proximity = shoreProximityAt(col, row);
    if (!proximity) return { u: 0, v: 0, magnitude: 0 };
    const range = dayTemperatureRange(activeDay());
    if (!range) return { u: 0, v: 0, magnitude: 0 };
    const heating = heatingProgress(temperatureC, range.min, range.max);
    const suppression = windSuppression(meanWindKt);
    const magnitude = breezeMagnitudeKt(heating, suppression, proximity.distanceM);
    const { u, v } = breezeVector(magnitude, proximity.towardEast, proximity.towardNorth);
    return { u, v, magnitude };
  }

  function shoreProximityAt(col: number, row: number): ShoreProximity | null {
    if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return null;
    return shoreGrid[row * GRID.cols + col] ?? null;
  }

  /** Desvio de direção (graus) pelo mesmo relevo orográfico, 0 (neutro) se o toggle estiver desligado. */
  function orographicDeflectionFor(col: number, row: number, directionDeg: number): number {
    return flags.orographic ? deflectionAt(OROGRAPHIC_GRID, col, row, directionDeg) : 0;
  }

  /** Desvio de direção (graus) pela mesma curvatura da margem, 0 (neutro) se o toggle estiver desligado. */
  function curvatureDeflectionFor(col: number, row: number, directionDeg: number): number {
    return flags.shoreCurvature ? deflectionAt(CURVATURE_GRID, col, row, directionDeg) : 0;
  }

  /** Rajada não tem botão próprio: liga/desliga sozinha, junto com qualquer ícone de efeito do modelo. */
  function setGustsOn(on: boolean): void {
    if (gustsOn === on) return;
    gustsOn = on;
    particles.setGustsOn(gustsOn);
  }

  function syncGustsFromFlags(): void {
    setGustsOn(ICON_TOGGLE_IDS.some((id) => flags[id]));
  }

  /**
   * Ícone de partículas com 3 estados: desligado → ligado (contagem fixa, cobre
   * todo o mapa visível) → ligado (densidade adaptativa, só a área da represa
   * visível no zoom) → desligado de novo.
   */
  function cycleParticleMode(): void {
    if (!particlesOn) {
      particlesOn = true;
      flags.adaptiveDensity = false;
    } else if (!flags.adaptiveDensity) {
      flags.adaptiveDensity = true;
    } else {
      particlesOn = false;
      flags.adaptiveDensity = false;
    }
    syncParticleButton();
  }

  function syncParticleButton(): void {
    const pressed = !particlesOn ? "false" : flags.adaptiveDensity ? "mixed" : "true";
    particleButton.setAttribute("aria-pressed", pressed);
    const tooltip = !particlesOn ? "Partículas: desligadas" : flags.adaptiveDensity ? "Partículas: só represa visível" : "Partículas: mapa completo";
    particleButton.setAttribute("data-tooltip", tooltip);
    particleButton.setAttribute(
      "aria-label",
      !particlesOn
        ? "Partículas de vento desligadas"
        : flags.adaptiveDensity
          ? "Partículas de vento ligadas, densidade ajustada à área da represa visível no zoom atual"
          : "Partículas de vento ligadas, contagem fixa cobrindo todo o mapa visível",
    );
  }

  function activeDay(): WindDay {
    return flags.hiresSource ? hiresDayFor(day) : day;
  }

  /**
   * O painel/gráfico do dia mostram um número só por hora, então uma série por
   * estação (sem `horas` regional, caso do F1 ligado) é resumida pela estação
   * da barragem — o campo de vento das partículas continua espacial via `windAt`.
   */
  function panelDay(source: WindDay): WindDay {
    if (source.horas) return source;
    const representative = source.pontos?.barragem;
    return representative ? { ...source, horas: representative } : source;
  }

  function onModelFlagsChanged(): void {
    // Preenchido pelas features F3–F6 conforme são ligadas em particles.ts.
  }

  function renderDay(): void {
    const active = panelDay(activeDay());
    const hours = active.horas;
    if (!hours) return;
    const inmetHours = flags.inmetValidation ? validationHoursFor(day.id) : undefined;
    renderDayPanel(panelElements, active, hour, gustsOn, inmetHours);
    paintDayChart(dayChart, hours, hour);
  }

  function unproject(event: PointerEvent): LngLat {
    const rect = map.getCanvas().getBoundingClientRect();
    const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    return { lng: point.lng, lat: point.lat };
  }
}

function onWater(point: LngLat): boolean {
  return inReservoir(RINGS, point.lng, point.lat);
}

/**
 * F11: pré-computa, uma vez por célula de água, a distância e a direção até o ponto da margem
 * mais próximo — pura geometria de `water.json`, sem busca externa, independente de direção
 * do vento (por isso cabe calcular uma vez aqui, não um grid de 8 direções como os outros).
 */
function buildShoreGrid(waterCells: { col: number; row: number }[]): (ShoreProximity | null)[] {
  const outerRing = RINGS[0];
  const grid: (ShoreProximity | null)[] = new Array(GRID.cols * GRID.rows).fill(null);
  if (!outerRing) return grid;
  for (const cell of waterCells) {
    const center = gridCenter(GRID, cell.col, cell.row);
    grid[cell.row * GRID.cols + cell.col] = nearestShoreProximity(outerRing, center, eastNorthMeters);
  }
  return grid;
}

/** Lookup bounds-checked genérico, igual para o grid orográfico e o de curvatura (mesmo formato cols/rows/cells). */
function deflectionAt(
  grid: { cols: number; rows: number; cells: (number[] | null)[] },
  col: number,
  row: number,
  directionDeg: number,
): number {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0;
  const factors = grid.cells[row * grid.cols + col];
  return factors ? deflectionAngle(factors, directionDeg) : 0;
}

export type { WindDay };
