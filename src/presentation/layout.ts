import type { Map as MapView } from "maplibre-gl";
import { setViewMode, type ViewMode } from "../map/layers";
import { RELIEF_STOPS } from "../map/mapStyle";

export function mountReliefLegend(ramp: HTMLElement, ticks: HTMLElement): void {
  const first = RELIEF_STOPS[0];
  const last = RELIEF_STOPS[RELIEF_STOPS.length - 1];
  if (!first || !last) return;
  const span = last.meters - first.meters;
  ramp.style.background = `linear-gradient(90deg, ${RELIEF_STOPS.map((stop) => `${stop.color} ${((stop.meters - first.meters) / span) * 100}%`).join(", ")})`;
  for (const stop of [first, last]) {
    const label = document.createElement("span");
    label.textContent = `${stop.meters} m`;
    ticks.append(label);
  }
}

export function placeSpeedScale(): void {
  const dock = document.querySelector<HTMLElement>("#dock");
  const clearance = dock ? Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + 12) : 128;
  const metric = document.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-left");
  if (metric) {
    metric.style.left = "16px";
    metric.style.bottom = `${clearance}px`;
  }
}

export type PaddingElements = {
  hud: HTMLElement;
  hudShell: HTMLElement;
};

export function syncHudPadding(map: MapView, elements: PaddingElements): void {
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const collapsed = elements.hudShell.classList.contains("is-collapsed");
  const dock = document.querySelector<HTMLElement>("#dock");
  const timebar = document.querySelector<HTMLElement>("#timebar");
  const fromBottom = (element: HTMLElement | null): number => {
    if (!element) return 0;
    return Math.max(0, window.innerHeight - element.getBoundingClientRect().top);
  };
  const bottom = Math.ceil(Math.max(fromBottom(dock), fromBottom(timebar)) + 8);
  const sheet = elements.hud.offsetWidth;
  placeSpeedScale();
  const left = collapsed ? 64 : 16 + sheet + 8 + 44 + 16;
  const top = narrow ? (collapsed ? 72 : Math.min(elements.hud.offsetHeight + 28, Math.round(window.innerHeight * 0.46))) : 24;
  map.setPadding({ top, right: narrow ? 16 : 24, bottom, left: narrow ? 16 : left });
}

export type DockElements = {
  legend: HTMLElement;
  dockButtons: HTMLButtonElement[];
};

export function setViewModeChrome(map: MapView, mode: ViewMode, exaggeration: number, elements: DockElements): void {
  setViewMode(map, mode, exaggeration);
  elements.legend.hidden = mode !== "relief";
  for (const button of elements.dockButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  placeSpeedScale();
}
