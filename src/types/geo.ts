/**
 * Camadas estáticas do mapa (`/geo/rp-base.json` e `/geo/rp-secondary.json`),
 * geradas por `scripts/build-geodata.mjs` a partir do OpenStreetMap.
 */
import type { LngLat, SensorType } from "./api";

export type LineFeature<P> = {
  type: "Feature";
  properties: P;
  geometry: { type: "LineString"; coordinates: LngLat[] };
};

export type FeatureCollection<P> = { type: "FeatureCollection"; features: Array<LineFeature<P>> };

export type PipeProps = {
  id: string;
  /** trunk = adutora · main = rede principal · sec = rede secundária */
  c: "trunk" | "main" | "sec";
  d: number;
  m: string;
  y: number;
  s: string;
  st?: string | null;
  sys?: string;
};

export type StreamProps = { n: string; k: "aberto" | "galeria"; w: string };

export type MapBase = {
  generatedAt: string;
  attribution: string;
  city: { name: string; state: string; center: LngLat; bbox: [number, number, number, number] };
  boundary: LngLat[];
  sectors: Array<{
    id: string;
    name: string;
    system: string;
    neighborhoods: string[];
    centroid: LngLat;
    polygon: LngLat[];
  }>;
  network: FeatureCollection<PipeProps>;
  streams: FeatureCollection<StreamProps>;
  reservoirs: Array<{
    id: string;
    kind: "elevado" | "apoiado";
    name: string;
    osmName: string | null;
    osmId: string;
    capacity: number;
    groundElevation: number;
    head: number;
    sector: string;
    system: string;
    lngLat: LngLat;
  }>;
  wells: Array<{ id: string; name: string; osmId: string; sector: string | null; lngLat: LngLat }>;
  facilities: Array<{
    id: string;
    osmId: string;
    name: string;
    amenity: string;
    kind: string;
    sector: string | null;
    lngLat: LngLat;
  }>;
  hotspots: Array<{
    id: string;
    name: string;
    street: string;
    stream: string;
    sector: string | null;
    gallery: string;
    lngLat: LngLat;
  }>;
  sensors: Array<{
    id: string;
    type: SensorType;
    sector: string | null;
    target: string;
    elevation: number;
    host?: string | null;
    stream?: string;
    lngLat: LngLat;
  }>;
  candidates: Array<{ lngLat: LngLat; sector: string | null; street: string | null }>;
};
