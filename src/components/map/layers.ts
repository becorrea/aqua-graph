/**
 * Camadas operacionais desenhadas sobre o mapa base: setores, rede de
 * distribuição, córregos, ativos, sensores e campos analíticos.
 *
 * Tudo o que é dado muda via `setData` (GeoJSON) — o estilo das camadas é
 * declarado uma única vez aqui.
 */
import type { LayerSpecification } from "maplibre-gl";
import type { Severity } from "@/types";
import type { LngLat, SensorReading } from "@/types/api";
import type { MapBase } from "@/types/geo";
import { MAP_COLORS as C } from "./basemap";

export type MapLayerKey =
  | "sectors"
  | "network"
  | "secondary"
  | "streams"
  | "reservoirs"
  | "sensors"
  | "facilities"
  | "leak"
  | "flood"
  | "susceptibility"
  | "uncertainty"
  | "coverage"
  | "plan";

export type LayerOption = { id: MapLayerKey; label: string; on: boolean };

export const LEVEL_COLOR: Record<Severity, string> = {
  normal: C.success,
  attention: C.warning,
  high: C.high,
  critical: C.critical,
  info: C.blue,
};

const levelColor = (fallback: string) =>
  [
    "match",
    ["get", "level"],
    "normal",
    LEVEL_COLOR.normal,
    "attention",
    LEVEL_COLOR.attention,
    "high",
    LEVEL_COLOR.high,
    "critical",
    LEVEL_COLOR.critical,
    "info",
    LEVEL_COLOR.info,
    fallback,
  ] as const;

/** Ids das camadas MapLibre controladas por cada chave do painel de camadas. */
export const LAYER_GROUPS: Record<MapLayerKey, string[]> = {
  sectors: ["ag-sectors-fill", "ag-sectors-line", "ag-sector-labels"],
  network: ["ag-network-main", "ag-network-trunk-glow", "ag-network-trunk"],
  secondary: ["ag-network-sec"],
  streams: ["ag-streams-open", "ag-streams-culvert"],
  reservoirs: ["ag-reservoirs", "ag-wells"],
  sensors: ["ag-sensors-halo", "ag-sensors"],
  facilities: ["ag-facilities"],
  leak: ["ag-heat"],
  flood: ["ag-field-flood"],
  susceptibility: ["ag-field-susceptibility"],
  uncertainty: ["ag-field-uncertainty"],
  coverage: ["ag-field-coverage"],
  plan: [],
};

/** Ordem de prioridade do tooltip: o primeiro elemento sob o cursor vence. */
export const HOVER_LAYERS = [
  "ag-sensors",
  "ag-reservoirs",
  "ag-wells",
  "ag-facilities",
  "ag-highlight",
  "ag-network-trunk",
  "ag-network-main",
  "ag-network-sec",
  "ag-streams-open",
  "ag-streams-culvert",
  "ag-sectors-fill",
];

export const FIELD_BEFORE = "ag-sectors-fill";

export const OVERLAY_LAYERS: LayerSpecification[] = [
  {
    id: "ag-sectors-fill",
    type: "fill",
    source: "ag-sectors",
    paint: {
      "fill-color": levelColor(C.blue) as never,
      "fill-opacity": [
        "case",
        ["==", ["get", "selected"], 1],
        0.2,
        ["==", ["get", "styled"], 1],
        ["match", ["get", "level"], "critical", 0.13, "high", 0.11, "attention", 0.09, 0.05],
        0.025,
      ],
    },
  },
  {
    id: "ag-heat",
    type: "heatmap",
    source: "ag-heat",
    maxzoom: 17,
    paint: {
      "heatmap-weight": ["get", "w"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.9, 15, 1.6],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 22, 13, 48, 15, 90],
      "heatmap-opacity": 0.72,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(56,189,248,0)",
        0.15,
        "rgba(56,189,248,0.32)",
        0.35,
        "rgba(20,184,166,0.45)",
        0.55,
        "rgba(245,158,11,0.58)",
        0.75,
        "rgba(249,115,22,0.68)",
        0.92,
        "rgba(239,68,68,0.78)",
      ],
    },
  },
  {
    id: "ag-sectors-line",
    type: "line",
    source: "ag-sectors",
    paint: {
      "line-color": ["case", ["==", ["get", "styled"], 1], levelColor(C.blue), "#38bdf8"] as never,
      "line-opacity": [
        "case",
        ["==", ["get", "selected"], 1],
        0.95,
        ["==", ["get", "styled"], 1],
        0.55,
        0.28,
      ],
      "line-width": ["case", ["==", ["get", "selected"], 1], 2.4, 1],
    },
  },
  {
    id: "ag-boundary",
    type: "line",
    source: "ag-boundary",
    paint: {
      "line-color": "#7dd3fc",
      "line-opacity": 0.35,
      "line-width": 1.1,
      "line-dasharray": [4, 3],
    },
  },
  {
    id: "ag-streams-open",
    type: "line",
    source: "ag-streams",
    filter: ["==", ["get", "k"], "aberto"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#3aa3dd",
      "line-opacity": 0.85,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 14, 2.6, 17, 5],
    },
  },
  {
    id: "ag-streams-culvert",
    type: "line",
    source: "ag-streams",
    filter: ["==", ["get", "k"], "galeria"],
    paint: {
      "line-color": "#2f86bd",
      "line-opacity": 0.8,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 14, 2.2, 17, 4],
      "line-dasharray": [2, 1.6],
    },
  },
  {
    id: "ag-network-sec",
    type: "line",
    source: "ag-secondary",
    minzoom: 13,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": C.cyan,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 13.6, 0.22, 16, 0.4],
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 16, 1.4],
    },
  },
  {
    id: "ag-network-main",
    type: "line",
    source: "ag-network",
    filter: ["==", ["get", "c"], "main"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": C.cyan,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.38, 15, 0.62],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 14, 1.6, 17, 3.2],
    },
  },
  {
    id: "ag-network-trunk-glow",
    type: "line",
    source: "ag-network",
    filter: ["==", ["get", "c"], "trunk"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": C.cyan,
      "line-opacity": 0.22,
      "line-blur": 3,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 5, 15, 11],
    },
  },
  {
    id: "ag-network-trunk",
    type: "line",
    source: "ag-network",
    filter: ["==", ["get", "c"], "trunk"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#67e8f9",
      "line-opacity": 0.95,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 14, 2.8, 17, 5],
    },
  },
  {
    id: "ag-highlight-glow",
    type: "line",
    source: "ag-highlight",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": levelColor(C.critical) as never,
      "line-opacity": 0.35,
      "line-blur": 4,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 7, 16, 16],
    },
  },
  {
    id: "ag-highlight",
    type: "line",
    source: "ag-highlight",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": levelColor(C.critical) as never,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.6, 16, 6],
    },
  },
  {
    id: "ag-facilities",
    type: "circle",
    source: "ag-facilities",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 6],
      "circle-color": C.surface2,
      "circle-stroke-color": "#e2e8f0",
      "circle-stroke-width": 1.3,
      "circle-opacity": 0.95,
    },
  },
  {
    id: "ag-wells",
    type: "circle",
    source: "ag-wells",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.6, 15, 5],
      "circle-color": C.bgDeep,
      "circle-stroke-color": C.teal,
      "circle-stroke-width": 1.6,
    },
  },
  {
    id: "ag-reservoirs",
    type: "circle",
    source: "ag-reservoirs",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11,
        ["case", ["==", ["get", "kind"], "apoiado"], 5.5, 4.2],
        15,
        ["case", ["==", ["get", "kind"], "apoiado"], 10, 7.5],
      ],
      "circle-color": "#0b2a40",
      "circle-stroke-color": levelColor(C.blue) as never,
      "circle-stroke-width": 2,
    },
  },
  {
    id: "ag-sensors-halo",
    type: "circle",
    source: "ag-sensors",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 15, 12],
      "circle-color": levelColor(C.cyan) as never,
      "circle-opacity": [
        "match",
        ["get", "level"],
        "critical",
        0.28,
        "high",
        0.24,
        "attention",
        0.2,
        0.12,
      ],
      "circle-blur": 0.4,
    },
  },
  {
    id: "ag-sensors",
    type: "circle",
    source: "ag-sensors",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11,
        ["match", ["get", "type"], "flow", 3.6, 2.8],
        15,
        ["match", ["get", "type"], "flow", 6.4, 5],
      ],
      "circle-color": [
        "case",
        ["==", ["get", "level"], "normal"],
        C.cyan,
        levelColor(C.cyan),
      ] as never,
      "circle-stroke-color": C.bgDeep,
      "circle-stroke-width": 1.2,
    },
  },
  {
    id: "ag-sector-labels",
    type: "symbol",
    source: "ag-sector-points",
    layout: {
      "text-field": [
        "case",
        ["has", "caption"],
        [
          "format",
          ["get", "id"],
          { "font-scale": 1 },
          "\n",
          {},
          ["get", "caption"],
          { "font-scale": 0.86 },
        ],
        ["get", "id"],
      ],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13],
      "text-letter-spacing": 0.06,
      "text-allow-overlap": false,
      "text-padding": 8,
      "symbol-sort-key": ["case", ["==", ["get", "styled"], 1], 0, 1],
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "styled"], 1],
        levelColor("#cbd5e1"),
        "#94a3b8",
      ] as never,
      "text-halo-color": C.bgDeep,
      "text-halo-width": 1.6,
      "text-opacity": 0.92,
    },
  },
];

// ---------------------------------------------------------------------------
// Construtores de GeoJSON
// ---------------------------------------------------------------------------

export type SectorStyle = { level: Severity; caption?: string; detail?: string };

type Props = Record<string, string | number | boolean | null>;

const point = (lngLat: LngLat, properties: Props) => ({
  type: "Feature" as const,
  properties,
  geometry: { type: "Point" as const, coordinates: lngLat },
});

export function sectorsGeoJSON(
  base: MapBase,
  styles: Record<string, SectorStyle> | undefined,
  selected: string | null,
) {
  return {
    type: "FeatureCollection" as const,
    features: base.sectors.map((sector) => {
      const style = styles?.[sector.id];
      return {
        type: "Feature" as const,
        properties: {
          id: sector.id,
          name: sector.name,
          level: style?.level ?? "info",
          styled: style ? 1 : 0,
          selected: sector.id === selected ? 1 : 0,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[...sector.polygon, sector.polygon[0] as LngLat]],
        },
      };
    }),
  };
}

export function sectorPointsGeoJSON(
  base: MapBase,
  styles: Record<string, SectorStyle> | undefined,
) {
  return {
    type: "FeatureCollection" as const,
    features: base.sectors.map((sector) => {
      const style = styles?.[sector.id];
      const properties: Props = {
        id: sector.id,
        level: style?.level ?? "info",
        styled: style ? 1 : 0,
      };
      if (style?.caption) properties["caption"] = style.caption;
      return point(sector.centroid, properties);
    }),
  };
}

export function sensorsGeoJSON(base: MapBase, readings: Record<string, SensorReading> | undefined) {
  return {
    type: "FeatureCollection" as const,
    features: base.sensors.map((sensor) =>
      point(sensor.lngLat, {
        id: sensor.id,
        type: sensor.type,
        level: readings?.[sensor.id]?.level ?? "normal",
      }),
    ),
  };
}

export function reservoirsGeoJSON(
  base: MapBase,
  readings: Record<string, SensorReading> | undefined,
) {
  const levelBySensor = new Map(
    base.sensors
      .filter((s) => s.type === "level")
      .map((s) => [s.target, readings?.[s.id]?.level ?? "info"]),
  );
  return {
    type: "FeatureCollection" as const,
    features: base.reservoirs.map((reservoir) =>
      point(reservoir.lngLat, {
        id: reservoir.id,
        kind: reservoir.kind,
        level: levelBySensor.get(reservoir.id) ?? "info",
      }),
    ),
  };
}

export function pointsGeoJSON<T extends { lngLat: LngLat; id: string }>(
  items: T[],
  extra?: (item: T) => Props,
) {
  return {
    type: "FeatureCollection" as const,
    features: items.map((item) => point(item.lngLat, { id: item.id, ...(extra?.(item) ?? {}) })),
  };
}

export function boundaryGeoJSON(base: MapBase) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: [...base.boundary, base.boundary[0] as LngLat],
    },
  };
}

export const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
