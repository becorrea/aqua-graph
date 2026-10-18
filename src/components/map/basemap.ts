/**
 * Estilo do mapa base: OpenStreetMap (tiles vetoriais da OpenFreeMap, sem
 * chave de API) desenhado com a paleta do AquaGraph.
 *
 * O mapa é propositalmente discreto — navy profundo, vias em azul-ardósia,
 * rótulos em cinza-azulado — para que a camada operacional (rede, sensores,
 * riscos) seja sempre o que mais chama a atenção. MapLibre não aceita
 * oklch, então os tokens de `styles.css` aparecem aqui em hexadecimal.
 */
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/** Tokens do design system convertidos de oklch para hex. */
export const MAP_COLORS = {
  bgDeep: "#07111f",
  bg: "#081827",
  bgSoft: "#0b1e2e",
  surface1: "#0d2233",
  surface2: "#10293c",
  surface3: "#132f43",
  cyan: "#22d3ee",
  blue: "#38bdf8",
  teal: "#14b8a6",
  success: "#22c55e",
  warning: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
  text: "#f8fafc",
  text2: "#94a3b8",
  text3: "#64748b",
} as const;

const land = "#081626";
const roadMinor = "#0f2438";
const roadMajor = "#17344d";
const roadMotorway = "#1c4260";

const isLine: ExpressionSpecification = [
  "match",
  ["geometry-type"],
  ["LineString", "MultiLineString"],
  true,
  false,
];
const isPolygon: ExpressionSpecification = [
  "match",
  ["geometry-type"],
  ["MultiPolygon", "Polygon"],
  true,
  false,
];
const isPoint: ExpressionSpecification = [
  "match",
  ["geometry-type"],
  ["MultiPoint", "Point"],
  true,
  false,
];

export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>';

export const basemapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": land } },
    {
      id: "landuse-residential",
      type: "fill",
      source: "osm",
      "source-layer": "landuse",
      filter: ["all", isPolygon, ["==", ["get", "class"], "residential"]],
      paint: { "fill-color": "#0a1b2c", "fill-opacity": 0.55 },
    },
    {
      id: "landcover-green",
      type: "fill",
      source: "osm",
      "source-layer": "landcover",
      filter: [
        "all",
        isPolygon,
        ["match", ["get", "class"], ["grass", "wood", "farmland", "scrub"], true, false],
      ],
      paint: { "fill-color": "#0a2229", "fill-opacity": 0.5 },
    },
    {
      id: "landuse-park",
      type: "fill",
      source: "osm",
      "source-layer": "park",
      filter: isPolygon,
      paint: { "fill-color": "#0b252b", "fill-opacity": 0.55 },
    },
    {
      id: "water",
      type: "fill",
      source: "osm",
      "source-layer": "water",
      filter: ["all", isPolygon, ["!=", ["get", "brunnel"], "tunnel"]],
      paint: { "fill-color": "#0c2c45", "fill-antialias": false },
    },
    {
      id: "waterway",
      type: "line",
      source: "osm",
      "source-layer": "waterway",
      filter: ["all", isLine, ["!=", ["get", "brunnel"], "tunnel"]],
      paint: {
        "line-color": "#11476b",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 2.4, 17, 4],
      },
    },
    {
      id: "building",
      type: "fill",
      source: "osm",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": "#0c1d2f",
        "fill-outline-color": "#112a40",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.85],
      },
    },
    {
      id: "railway",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["all", isLine, ["==", ["get", "class"], "rail"]],
      paint: { "line-color": "#1a2d42", "line-width": 1.2, "line-dasharray": [3, 3] },
    },
    {
      id: "road-minor",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["all", isLine, ["match", ["get", "class"], ["minor", "service"], true, false]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadMinor,
        "line-width": ["interpolate", ["exponential", 1.55], ["zoom"], 12, 0.5, 14, 1.6, 17, 7],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      filter: [
        "all",
        isLine,
        ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadMajor,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 11, 0.9, 14, 3, 17, 11],
      },
    },
    {
      id: "road-motorway",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      filter: ["all", isLine, ["==", ["get", "class"], "motorway"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadMotorway,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 11, 1.4, 14, 4, 17, 13],
      },
    },
    {
      id: "road-label",
      type: "symbol",
      source: "osm",
      "source-layer": "transportation_name",
      minzoom: 14,
      filter: isLine,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 320,
        "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9, 17, 11],
        "text-max-angle": 30,
      },
      paint: { "text-color": "#5d7591", "text-halo-color": land, "text-halo-width": 1.2 },
    },
    {
      id: "waterway-label",
      type: "symbol",
      source: "osm",
      "source-layer": "waterway",
      minzoom: 13,
      filter: ["all", isLine, ["has", "name"]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 9.5,
        "text-letter-spacing": 0.04,
      },
      paint: { "text-color": "#3f86b4", "text-halo-color": land, "text-halo-width": 1.2 },
    },
    {
      id: "place-neighbourhood",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 12,
      maxzoom: 16,
      filter: [
        "all",
        isPoint,
        ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter"], true, false],
      ],
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 8.5, 15, 10.5],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#6e86a3",
        "text-halo-color": land,
        "text-halo-width": 1.4,
        "text-opacity": 0.6,
      },
    },
  ],
};
