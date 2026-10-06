import { Map as MapView, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { formatRelief } from "./domain/format";
import { VIEWPOINTS } from "./domain/viewpoints";
import { createCameraRig } from "./map/cameraRig";
import { setLabelsEnabled, showTerrain } from "./map/layers";
import { HILLSHADE_LAYER, INITIAL_EXAGGERATION, RELIEF_SOURCE, hillshadeExaggeration, mapStyle } from "./map/mapStyle";
import { createMinimap } from "./map/minimap";
import { required } from "./presentation/dom";
import { updateCameraHud } from "./presentation/hud";
import { mountReliefLegend, placeSpeedScale, setViewModeChrome, syncHudPadding } from "./presentation/layout";
import { attachWind } from "./presentation/wind";
import "./style.css";

setWorkerUrl(workerUrl);

const mapEl = required<HTMLElement>("#map");
const statusEl = required<HTMLElement>("#status");
const readoutEl = required<HTMLElement>("#readout");
const orbitButton = required<HTMLButtonElement>("#orbit");
const reliefInput = required<HTMLInputElement>("#relief");
const reliefValue = required<HTMLElement>("#relief-value");
const minimapEl = required<HTMLElement>("#minimap");
const markerEl = required<HTMLElement>("#minimap-marker");
const dockButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
const labelsButton = required<HTMLButtonElement>("#labels");
const legend = required<HTMLElement>("#relief-legend");
const compass = required<HTMLButtonElement>("#compass");
const hudShell = required<HTMLElement>("#hud-shell");
const hud = required<HTMLElement>("#hud");
const hudToggle = required<HTMLButtonElement>("#hud-toggle");
const dayPanel = required<HTMLElement>("#day-panel");
const dayToggle = required<HTMLButtonElement>("#day-toggle");

const home = VIEWPOINTS[0];
if (!home) throw new Error("Ponto de vista inicial ausente");

const map = new MapView({
  container: mapEl,
  style: mapStyle,
  center: [home.lng, home.lat],
  zoom: 12,
  pitch: home.pitch,
  bearing: home.bearing,
  maxPitch: 85,
  attributionControl: false,
  centerClampedToGround: false,
  dragPan: false,
  dragRotate: false,
  scrollZoom: false,
  boxZoom: false,
  doubleClickZoom: false,
  keyboard: false,
  touchZoomRotate: false,
  touchPitch: false,
  canvasContextAttributes: { antialias: true },
});

map.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");

let ready = false;
const failTimer = window.setTimeout(() => {
  if (!ready) statusEl.textContent = "A imagem não carregou. Confira a rede e atualize a página.";
}, 8000);

mountReliefLegend(required("#relief-ramp"), required("#relief-ticks"));

map.on("load", () => {
  ready = true;
  window.clearTimeout(failTimer);
  statusEl.classList.add("is-done");
  setViewModeChrome(map, "map", Number(reliefInput.value), { legend, dockButtons });
  syncHudPadding(map, { hud, hudShell });
  requestAnimationFrame(frame);
});
map.once("idle", () => {
  map.getCanvas().setAttribute("aria-hidden", "true");
});
map.on("error", (event) => {
  const source = "sourceId" in event ? event.sourceId : undefined;
  if (source && source !== RELIEF_SOURCE) return;
  if (!ready && source === RELIEF_SOURCE) {
    statusEl.textContent = "O relevo não carregou. A imagem segue disponível.";
  }
});

const rig = createCameraRig(map, mapEl, home, { orbitButton, compass });
const minimap = createMinimap(minimapEl, markerEl, (lng, lat) => rig.lookAt(lng, lat));

reliefInput.value = String(INITIAL_EXAGGERATION);
reliefValue.textContent = formatRelief(INITIAL_EXAGGERATION);

const wind = attachWind(map);

hudToggle.addEventListener("click", () => {
  const collapsed = hudShell.classList.toggle("is-collapsed");
  if (collapsed && hud.contains(document.activeElement)) hudToggle.focus();
  hud.inert = collapsed;
  hudToggle.setAttribute("aria-expanded", String(!collapsed));
  hudToggle.setAttribute("aria-label", collapsed ? "Abrir o painel lateral" : "Recolher o painel lateral");
  syncHudPadding(map, { hud, hudShell });
});
dayToggle.addEventListener("click", () => {
  const collapsed = dayPanel.classList.toggle("is-collapsed");
  dayToggle.setAttribute("aria-expanded", String(!collapsed));
  dayToggle.textContent = collapsed ? "Abrir" : "Recolher";
  wind.resize();
});

window.addEventListener("wind-chrome", () => {
  placeSpeedScale();
  syncHudPadding(map, { hud, hudShell });
});
window.addEventListener("resize", () => {
  syncHudPadding(map, { hud, hudShell });
  minimap.resize();
  wind.resize();
});
reliefInput.addEventListener("input", () => {
  const value = Number(reliefInput.value);
  showTerrain(map, value);
  map.setPaintProperty(HILLSHADE_LAYER, "hillshade-exaggeration", hillshadeExaggeration(value));
  reliefValue.textContent = formatRelief(value);
});

for (const button of dockButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (mode !== "map" && mode !== "relief" && mode !== "satellite") return;
    setViewModeChrome(map, mode, Number(reliefInput.value), { legend, dockButtons });
  });
}
labelsButton.addEventListener("click", () => {
  const enabled = labelsButton.getAttribute("aria-pressed") !== "true";
  labelsButton.setAttribute("aria-pressed", String(enabled));
  setLabelsEnabled(map, enabled);
});

let last = performance.now();

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  rig.step(dt);
  updateCameraHud({ readoutEl, compass }, rig.getCamera(), minimap);
  wind.frame(dt);
  requestAnimationFrame(frame);
}
