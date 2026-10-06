import type { Map as MapView } from "maplibre-gl";
import { BASEMAP_LAYER_IDS, RELIEF_SOURCE } from "./mapStyle";

export type ViewMode = "map" | "relief" | "satellite";

const LAYER = {
  satellite: "satellite",
  relief: "color-relief",
  shade: "relief",
  water: "water-fill",
  shore: "water-shore",
  labels: "places",
  dots: "places-dot",
} as const;

let mode: ViewMode = "map";

function show(map: MapView, id: string, visible: boolean): void {
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export function showTerrain(map: MapView, exaggeration: number): void {
  if (mode === "map") {
    map.setTerrain(null);
  } else {
    map.setTerrain({ source: RELIEF_SOURCE, exaggeration });
  }
}

function applyWater(map: MapView): void {
  const lake = mode !== "satellite";
  show(map, LAYER.water, lake);
  show(map, LAYER.shore, lake);
}

export function setViewMode(map: MapView, next: ViewMode, exaggeration: number): void {
  mode = next;
  show(map, LAYER.satellite, mode === "satellite");
  show(map, LAYER.relief, mode === "relief");
  show(map, LAYER.shade, true);
  for (const id of BASEMAP_LAYER_IDS) show(map, id, mode === "map");
  showTerrain(map, exaggeration);
  applyWater(map);
  const onMap = mode === "map";
  map.setPaintProperty(LAYER.shade, "hillshade-shadow-color", onMap ? "rgba(48, 72, 58, 0.55)" : "#14201c");
  map.setPaintProperty(LAYER.shade, "hillshade-highlight-color", onMap ? "rgba(255, 250, 242, 0.35)" : "#fffaf2");
  map.setPaintProperty(LAYER.shade, "hillshade-accent-color", onMap ? "rgba(36, 58, 46, 0.28)" : "#1c2822");
  map.setPaintProperty(LAYER.labels, "text-color", onMap ? "#f4f7f2" : "#f7fff8");
  map.setPaintProperty(LAYER.labels, "text-halo-color", onMap ? "#102018" : "#0c1411");
  map.setPaintProperty(LAYER.labels, "text-halo-width", onMap ? 1.6 : 1.4);
  map.setPaintProperty(
    LAYER.dots,
    "circle-color",
    onMap
      ? ["match", ["get", "kind"], "island", "#b8923e", "#1a3329"]
      : ["match", ["get", "kind"], "island", "#f2d16b", "#f4fff8"],
  );
  map.setPaintProperty(LAYER.dots, "circle-stroke-color", onMap ? "#f4f7f2" : "#102018");
}

export function setLabelsEnabled(map: MapView, enabled: boolean): void {
  show(map, LAYER.labels, enabled);
  show(map, LAYER.dots, enabled);
}
