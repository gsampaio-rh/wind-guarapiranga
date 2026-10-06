import type { Map as MapView } from "maplibre-gl";
import water from "../../data/water.json";
import { boundsGrid, gridCenter } from "../../domain/geo";
import { inReservoir, waterCellsOf, waterMask } from "../../domain/water";
import { WIND_DAYS, sampleSeries, type WindDay } from "../../domain/wind/series";
import { required } from "../dom";
import { paintDayChart } from "./chart";
import { formatCellReadout, formatHour, formatWindSource } from "./format";
import { mountDayPicker, renderDayPanel, type DayPanelElements } from "./panel";
import { createParticleCanvas, type WindSample } from "./particles";

const HOURS_PER_SECOND = 1;
const SPEEDS = [1, 2, 4, 8];

const RINGS = water.geometry.coordinates;
const GRID = boundsGrid();

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
  const gustButton = required<HTMLButtonElement>("#wind-gust");
  const gustLegend = required<HTMLElement>("#gust-legend");
  const particleButton = required<HTMLButtonElement>("#wind-particles");
  const dayChart = required<HTMLCanvasElement>("#day-chart");

  const panelElements: DayPanelElements = {
    dayName: required("#day-name"),
    dayWhen: required("#day-when"),
    dayWind: required("#day-wind"),
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

  let day = WIND_DAYS[0];
  if (!day) throw new Error("Catálogo de vento vazio");
  let hour = 15;
  let playing = false;
  let speed = 1;
  let simDt = 0;
  let gustsOn = false;
  let particlesOn = true;
  let pointer: { x: number; y: number } | null = null;

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
  gustButton.addEventListener("click", () => {
    gustsOn = !gustsOn;
    gustButton.setAttribute("aria-pressed", String(gustsOn));
    gustButton.setAttribute(
      "aria-label",
      gustsOn
        ? "Rajada ligada. Alguns traços ficam vermelhos enquanto sobem até a rajada da hora e voltam"
        : "Rajada. Alguns traços, de vez em quando, ficam vermelhos e sobem até a rajada da hora",
    );
    gustLegend.hidden = !gustsOn;
    particles.setGustsOn(gustsOn);
    renderDay();
    window.dispatchEvent(new Event("wind-chrome"));
  });
  particleButton.addEventListener("click", () => {
    particlesOn = !particlesOn;
    particleButton.setAttribute("aria-pressed", String(particlesOn));
  });
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
    cellReadout.textContent = sample
      ? formatCellReadout(sample.mean, sample.direction, sample.gust)
      : "Clique na água para ler a célula.";
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
    source.textContent = formatWindSource(day, hour);
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
    particles.step(simDt || 0.016, windAt, gustsOn);
    particles.draw(particlesOn);
  }

  function windAt(lng: number, lat: number): (WindSample & { direction: number }) | null {
    if (!onWater({ lng, lat })) return null;
    const regional = sampleSeries(day, hour, lng, lat);
    return { u: regional.u, v: regional.v, mean: regional.velocidade, gust: regional.rajada, direction: regional.direcao };
  }

  function renderDay(): void {
    const hours = day.horas;
    if (!hours) return;
    renderDayPanel(panelElements, day, hour, gustsOn);
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

export type { WindDay };
