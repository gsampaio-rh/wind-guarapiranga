import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { placesGeoJson } from "../data/places";
import { smoothedWaterFeature as water } from "../data/waterGeometry";

export const RELIEF_SOURCE = "terrain";
export const SHADE_SOURCE = "shade";
export const HILLSHADE_LAYER = "relief";
export const INITIAL_EXAGGERATION = 1.3;

export function hillshadeExaggeration(terrainExaggeration: number): number {
  return Math.min(0.85, 0.25 + (terrainExaggeration - 1) * 0.32);
}

export const RELIEF_STOPS = [
  { meters: 700, color: "#16382c" },
  { meters: 735, color: "#2f6b4f" },
  { meters: 760, color: "#7dba7a" },
  { meters: 800, color: "#e4d7a4" },
  { meters: 860, color: "#f6f1e4" },
] as const;

function satelliteSource() {
  return {
    type: "raster" as const,
    tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"],
    tileSize: 256,
    maxzoom: 14,
    attribution: "Imagens Sentinel-2 cloudless © EOX (Copernicus Sentinel 2025)",
  };
}

/** Alta resolução: cobre a mesma área com imagens bem mais detalhadas que o Sentinel-2 (10 m/px, zoom 14). */
function satelliteEsriSource() {
  return {
    type: "raster" as const,
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Esri, Maxar, Earthstar Geographics, GIS User Community",
  };
}

function demSource(attribution?: string) {
  return {
    type: "raster-dem" as const,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding: "terrarium" as const,
    tileSize: 256,
    maxzoom: 15,
    ...(attribution ? { attribution } : {}),
  };
}

const BASE = { visibility: "visible" } as const;

function basemapLayers(): LayerSpecification[] {
  const land = (id: string, sourceLayer: string, classes: string[], color: string, opacity: number): LayerSpecification => ({
    id,
    type: "fill",
    source: "openmaptiles",
    "source-layer": sourceLayer,
    layout: BASE,
    filter: sourceLayer === "landcover"
      ? ["match", ["get", "class"], classes, true, false]
      : ["all", ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false], ["match", ["get", "class"], classes, true, false]],
    paint: { "fill-color": color, "fill-opacity": opacity },
  });
  const road = (id: string, classes: string[], color: string, width: number): LayerSpecification => ({
    id,
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
    layout: { ...BASE, "line-cap": "round", "line-join": "round" },
    filter: [
      "all",
      ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      ["!=", ["get", "brunnel"], "tunnel"],
      ["match", ["get", "class"], classes, true, false],
    ],
    paint: {
      "line-color": color,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, width * 0.3, 15, width],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0.2, 12.2, 0.9],
    },
  });
  const roadPair = (id: string, classes: string[], fill: string, casing: string, width: number): LayerSpecification[] => [
    road(`${id}-case`, classes, casing, width + 1.8),
    road(id, classes, fill, width),
  ];
  return [
    { id: "base-background", type: "background", layout: BASE, paint: { "background-color": "#e3ece4" } },
    land("base-farm", "landcover", ["farmland", "grass"], "#d5e3c4", 0.55),
    land("base-wood", "landcover", ["wood", "scrub"], "#8fb888", 0.62),
    land("base-wetland", "landcover", ["wetland"], "#c5d7c8", 0.7),
    {
      id: "base-park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      layout: BASE,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: { "fill-color": "#c9ddb4", "fill-opacity": 0.72 },
    },
    land("base-residential", "landuse", ["residential", "neighbourhood"], "#efe6da", 0.42),
    land("base-industrial", "landuse", ["industrial"], "#e4d9e0", 0.46),
    land("base-commercial", "landuse", ["commercial"], "#f3dede", 0.42),
    land("base-cemetery", "landuse", ["cemetery"], "#cddac8", 0.58),
    {
      id: "base-water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      layout: BASE,
      paint: { "fill-color": "#b7d0dc" },
    },
    {
      id: "base-waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      layout: { ...BASE, "line-cap": "round" },
      paint: { "line-color": "#8fb9cf", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 15, 2.2] },
    },
    {
      id: "base-building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      layout: BASE,
      paint: {
        "fill-color": "#e6ddd2",
        "fill-outline-color": "#e6ddd2",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13.2, 0, 15.2, 0.8],
      },
    },
    {
      id: "base-building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": "#e9e1d6",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["*", ["coalesce", ["get", "levels"], 2], 3.2], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    },
    {
      id: "base-building-outline",
      type: "line",
      source: "openmaptiles",
      "source-layer": "building",
      layout: { visibility: "none", "line-join": "round" },
      paint: {
        "line-color": "#b7ab98",
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 17, 1.1],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 13.2, 0, 15.2, 0.9],
      },
    },
    ...roadPair("base-road-minor", ["minor", "service", "tertiary", "track"], "#f4f1ea", "#d9d0c4", 1.6),
    ...roadPair("base-road-major", ["primary", "secondary", "trunk"], "#f0d7a4", "#cbb88a", 2.8),
    ...roadPair("base-road-motorway", ["motorway"], "#e7b56a", "#c4924a", 3.4),
    {
      id: "base-poi-dot",
      type: "circle",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 14,
      layout: BASE,
      paint: { "circle-radius": 3, "circle-color": "#b4603c", "circle-stroke-color": "#fff8ef", "circle-stroke-width": 1 },
    },
    {
      id: "base-poi-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 15,
      layout: {
        ...BASE,
        "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": "#4a2f20", "text-halo-color": "#fff8ef", "text-halo-width": 1.2 },
    },
    {
      id: "base-place",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: {
        ...BASE,
        "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 16],
      },
      filter: ["match", ["get", "class"], ["city", "town", "suburb", "village"], true, false],
      paint: { "text-color": "#243028", "text-halo-color": "#e3ece4", "text-halo-width": 1.4 },
    },
  ];
}

export const BASEMAP_LAYER_IDS = [
  "base-background",
  "base-farm",
  "base-wood",
  "base-wetland",
  "base-park",
  "base-residential",
  "base-industrial",
  "base-commercial",
  "base-cemetery",
  "base-water",
  "base-waterway",
  "base-building",
  "base-road-minor-case",
  "base-road-minor",
  "base-road-major-case",
  "base-road-major",
  "base-road-motorway-case",
  "base-road-motorway",
  "base-poi-dot",
  "base-poi-label",
  "base-place",
] as const;

/** Camadas de prédio em 3D (extrusão + contorno), geridas separado de BASEMAP_LAYER_IDS
 *  porque sua visibilidade depende também do toggle de prédios 3D, não só do modo de visão. */
export const BUILDING_3D_LAYER_IDS = ["base-building-3d", "base-building-outline"] as const;

function reliefLayer(exaggeration: number) {
  return {
    id: HILLSHADE_LAYER,
    type: "hillshade" as const,
    source: SHADE_SOURCE,
    layout: { visibility: "visible" as const },
    paint: {
      "hillshade-method": "combined" as const,
      "hillshade-exaggeration": exaggeration,
      "hillshade-illumination-anchor": "map" as const,
      "hillshade-illumination-direction": 315,
      "hillshade-shadow-color": "rgba(48, 72, 58, 0.55)",
      "hillshade-highlight-color": "rgba(255, 250, 242, 0.35)",
      "hillshade-accent-color": "rgba(36, 58, 46, 0.28)",
    },
  };
}

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    satellite: satelliteSource(),
    satelliteEsri: satelliteEsriSource(),
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
    [RELIEF_SOURCE]: demSource("Relevo © AWS Terrain Tiles"),
    [SHADE_SOURCE]: demSource(),
    water: { type: "geojson", data: water },
    places: { type: "geojson", data: placesGeoJson },
  },
  layers: [
    { id: "sky-fill", type: "background", paint: { "background-color": "#8eb4d4" } },
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
      layout: { visibility: "none" },
      paint: {
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
        "raster-brightness-min": 0.07,
        "raster-saturation": 0.12,
      },
    },
    {
      id: "satellite-esri",
      type: "raster",
      source: "satelliteEsri",
      layout: { visibility: "none" },
      paint: {
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
        "raster-brightness-min": 0.07,
        "raster-saturation": 0.12,
      },
    },
    ...basemapLayers(),
    {
      id: "color-relief",
      type: "color-relief",
      source: SHADE_SOURCE,
      layout: { visibility: "none" },
      paint: {
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          ...RELIEF_STOPS.flatMap((stop) => [stop.meters, stop.color]),
        ],
      },
    },
    reliefLayer(hillshadeExaggeration(INITIAL_EXAGGERATION)),
    {
      id: "water-fill",
      type: "fill",
      source: "water",
      layout: { visibility: "visible" },
      paint: { "fill-color": "#123e56", "fill-opacity": 0.95 },
    },
    {
      id: "water-shore",
      type: "line",
      source: "water",
      layout: { visibility: "visible", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#c5e4f0",
        "line-width": 1.4,
        "line-blur": 0.8,
        "line-opacity": 0.45,
      },
    },
    {
      id: "places-dot",
      type: "circle",
      source: "places",
      paint: {
        "circle-radius": 4.5,
        "circle-color": ["match", ["get", "kind"], "island", "#b8923e", "#1a3329"],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#f4f7f2",
      },
    },
    {
      id: "places",
      type: "symbol",
      source: "places",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-offset": [0, 0.85],
        "text-anchor": "top",
        "text-max-width": 12,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#f4f7f2",
        "text-halo-color": "#102018",
        "text-halo-width": 1.6,
      },
    },
  ],
  sky: {
    "sky-color": "#8eb4d4",
    "horizon-color": "#e7f0f6",
    "fog-color": "#d5e2ee",
    "sky-horizon-blend": 0.5,
    "horizon-fog-blend": 0.55,
    "fog-ground-blend": 0.32,
  },
};

export const minimapStyle: StyleSpecification = {
  version: 8,
  sources: {
    satellite: satelliteSource(),
    [SHADE_SOURCE]: demSource(),
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
      paint: {
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
        "raster-brightness-min": 0.07,
        "raster-saturation": 0.12,
      },
    },
    reliefLayer(0.62),
  ],
};
