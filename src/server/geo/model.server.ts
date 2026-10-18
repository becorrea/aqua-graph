/**
 * Modelo geográfico da cidade, gerado por `scripts/build-geodata.mjs`.
 *
 * O JSON é importado como texto (`?raw`) e tipado aqui à mão — inferir o
 * tipo literal de um arquivo desse tamanho deixaria o TypeScript lento.
 */
import raw from "./rp-model.json?raw";
import type { LngLat, SensorType } from "@/types/api";

export type XY = [number, number];

export type ModelSector = {
  id: string;
  name: string;
  system: string;
  neighborhoods: string[];
  centroid: XY;
  areaKm2: number;
  population: number;
  connections: number;
  elevation: { min: number; mean: number; max: number };
  networkKm: { main: number; sec: number };
  inlet: XY;
  reservoirs: string[];
  polygon: XY[];
};

export type ModelReservoir = {
  id: string;
  kind: "elevado" | "apoiado";
  name: string;
  osmName: string | null;
  osmId: string;
  xy: XY;
  capacity: number;
  groundElevation: number;
  head: number;
  sector: string;
  system: string;
};

export type ModelSensor = {
  id: string;
  type: SensorType;
  xy: XY;
  z: number;
  sector: string | null;
  target: string;
  host?: string | null;
  stream?: string;
};

export type ModelHotspot = {
  id: string;
  name: string;
  street: string;
  stream: string;
  xy: XY;
  sector: string | null;
  elevation: number;
  susceptibility: number;
  catchmentKm2: number;
  flowLength: number;
  slope: number;
  tcMinutes: number;
  runoff: number;
  designIntensity: number;
  capacity: number;
  gallery: string;
  nearbyFacilities: Array<{ id: string; distance: number }>;
};

export type ModelFacility = {
  id: string;
  osmId: string;
  name: string;
  amenity: string;
  kind: string;
  xy: XY;
  sector: string | null;
};

export type ModelPipe = {
  id: string;
  cls: "main" | "sec";
  diameter: number;
  material: string;
  year: number;
  lengthM: number;
  street: string | null;
  mid: XY;
};

export type CityModel = {
  generatedAt: string;
  city: {
    name: string;
    state: string;
    center: LngLat;
    bbox: [number, number, number, number];
    timezone: string;
  };
  systems: Array<{ id: string; name: string; source: string | null }>;
  sectors: ModelSector[];
  reservoirs: ModelReservoir[];
  trunkMains: Array<{
    id: string;
    system: string;
    sector: string;
    diameter: number;
    lengthKm: number;
  }>;
  sensors: ModelSensor[];
  hotspots: ModelHotspot[];
  facilities: ModelFacility[];
  leak: { sector: string; pipeId: string; xy: XY; street: string | null };
  materials: string[];
  streets: string[];
  /** [id, classe 0|1, DN, material, ano, comprimento, x, y, rua] */
  pipes: Array<[string, 0 | 1, number, number, number, number, number, number, number]>;
  floodGrid: {
    bbox: [number, number, number, number];
    cols: number;
    rows: number;
    values: number[];
  };
  sensing: {
    /** [x, y, peso, índice do setor] em metros na projeção local. */
    points: Array<[number, number, number, number]>;
    candidates: Array<{ xy: XY; sector: string | null; street: string | null }>;
  };
  totals: { networkKm: number; trunkKm: number; population: number; connections: number };
};

export const model: CityModel = JSON.parse(raw) as CityModel;

/** Trechos de rede expandidos, agrupados por setor (o prefixo do id é o setor). */
export const pipesBySector = new Map<string, ModelPipe[]>();
for (const [id, cls, diameter, material, year, lengthM, x, y, street] of model.pipes) {
  const sectorId = `${id.slice(0, 2)}-${id.slice(2, 3)}`;
  const list = pipesBySector.get(sectorId) ?? [];
  list.push({
    id,
    cls: cls === 0 ? "main" : "sec",
    diameter,
    material: model.materials[material] ?? "—",
    year,
    lengthM,
    street: street >= 0 ? (model.streets[street] ?? null) : null,
    mid: [x, y],
  });
  pipesBySector.set(sectorId, list);
}

export const sectorById = new Map(model.sectors.map((sector) => [sector.id, sector]));
export const reservoirById = new Map(
  model.reservoirs.map((reservoir) => [reservoir.id, reservoir]),
);
export const sensorById = new Map(model.sensors.map((sensor) => [sensor.id, sensor]));
export const facilityById = new Map(model.facilities.map((facility) => [facility.id, facility]));
export const hotspotById = new Map(model.hotspots.map((hotspot) => [hotspot.id, hotspot]));

// ---------------------------------------------------------------------------
// Projeção local (a mesma do build): metros ↔ graus
// ---------------------------------------------------------------------------

const [LON0, LAT0] = model.city.center;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_540;

export function toLngLat([x, y]: XY): LngLat {
  return [Math.round((LON0 + x / KX) * 1e5) / 1e5, Math.round((LAT0 + y / KY) * 1e5) / 1e5];
}

export function toXY([lon, lat]: LngLat): XY {
  return [(lon - LON0) * KX, (lat - LAT0) * KY];
}

export const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pointInPolygon([x, y]: XY, polygon: XY[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i] as XY;
    const [xj, yj] = polygon[j] as XY;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Setor que contém o ponto (ou null fora do recorte). */
export function sectorAt(xy: XY): string | null {
  return model.sectors.find((sector) => pointInPolygon(xy, sector.polygon))?.id ?? null;
}

export function sectorsOfSystem(systemId: string) {
  return model.sectors.filter((sector) => sector.system === systemId);
}
