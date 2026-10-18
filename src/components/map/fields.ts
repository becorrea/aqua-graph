/**
 * Campos contínuos (risco de alagamento, incerteza, cobertura) chegam da API
 * como grades de bytes em base64. Aqui viram uma imagem PNG pequena, colorida
 * com a rampa do design system; o MapLibre a estica sobre o recorte com
 * reamostragem linear, o que suaviza a grade sem custo de GPU.
 */
import type { FieldGrid } from "@/types/api";
import { MAP_COLORS } from "./basemap";

export type RampStop = { at: number; color: string; alpha: number };

export const RAMPS = {
  risk: [
    { at: 0, color: MAP_COLORS.blue, alpha: 0 },
    { at: 0.12, color: MAP_COLORS.blue, alpha: 0.32 },
    { at: 0.38, color: MAP_COLORS.warning, alpha: 0.5 },
    { at: 0.62, color: MAP_COLORS.high, alpha: 0.62 },
    { at: 0.85, color: MAP_COLORS.critical, alpha: 0.72 },
  ],
  susceptibility: [
    { at: 0, color: MAP_COLORS.blue, alpha: 0 },
    { at: 0.15, color: MAP_COLORS.blue, alpha: 0.18 },
    { at: 0.5, color: MAP_COLORS.cyan, alpha: 0.38 },
    { at: 1, color: MAP_COLORS.teal, alpha: 0.55 },
  ],
  uncertainty: [
    { at: 0, color: MAP_COLORS.cyan, alpha: 0 },
    { at: 0.3, color: MAP_COLORS.teal, alpha: 0.08 },
    { at: 0.55, color: MAP_COLORS.warning, alpha: 0.26 },
    { at: 0.8, color: MAP_COLORS.high, alpha: 0.36 },
    { at: 1, color: MAP_COLORS.critical, alpha: 0.44 },
  ],
  coverage: [
    { at: 0, color: MAP_COLORS.critical, alpha: 0 },
    { at: 0.25, color: MAP_COLORS.warning, alpha: 0.1 },
    { at: 0.5, color: MAP_COLORS.teal, alpha: 0.22 },
    { at: 1, color: MAP_COLORS.cyan, alpha: 0.4 },
  ],
} satisfies Record<string, RampStop[]>;

export type RampName = keyof typeof RAMPS;

/** Tabela de 256 cores RGBA por rampa (calculada uma vez). */
const lutCache = new Map<string, Uint8ClampedArray>();

function lut(ramp: RampName) {
  const hit = lutCache.get(ramp);
  if (hit) return hit;
  const table = new Uint8ClampedArray(256 * 4);
  for (let v = 0; v < 256; v += 1) {
    const [r, g, b, a] = sample(RAMPS[ramp], v / 255);
    table.set([r, g, b, a * 255], v * 4);
  }
  lutCache.set(ramp, table);
  return table;
}

const hex = (color: string) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

function sample(ramp: RampStop[], value: number): [number, number, number, number] {
  const v = Math.min(1, Math.max(0, value));
  let lower = ramp[0] as RampStop;
  let upper = ramp[ramp.length - 1] as RampStop;
  for (let i = 0; i < ramp.length - 1; i += 1) {
    const a = ramp[i] as RampStop;
    const b = ramp[i + 1] as RampStop;
    if (v >= a.at && v <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }
  const t = upper.at === lower.at ? 0 : (v - lower.at) / (upper.at - lower.at);
  const [r1, g1, b1] = hex(lower.color);
  const [r2, g2, b2] = hex(upper.color);
  return [
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
    lower.alpha + (upper.alpha - lower.alpha) * t,
  ];
}

const decoded = new Map<string, Uint8Array>();

function decode(grid: FieldGrid) {
  const hit = decoded.get(grid.data);
  if (hit) return hit;
  const binary = atob(grid.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (decoded.size > 12) decoded.clear();
  decoded.set(grid.data, bytes);
  return bytes;
}

/** Desenha a grade numa imagem (data URL). `intensity` escala o campo (animações). */
export function fieldToImage(grid: FieldGrid, ramp: RampName, intensity = 1): string {
  const bytes = decode(grid);
  const canvas = document.createElement("canvas");
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(grid.cols, grid.rows);
  const table = lut(ramp);
  for (let i = 0; i < bytes.length; i += 1) {
    const v = Math.min(255, Math.round((bytes[i] ?? 0) * intensity)) * 4;
    image.data[i * 4] = table[v] ?? 0;
    image.data[i * 4 + 1] = table[v + 1] ?? 0;
    image.data[i * 4 + 2] = table[v + 2] ?? 0;
    image.data[i * 4 + 3] = table[v + 3] ?? 0;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Cantos da imagem na ordem exigida pelo MapLibre (NO, NE, SE, SO). */
export function fieldCoordinates(
  grid: FieldGrid,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [west, south, east, north] = grid.bbox;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

/** Valor do campo (0–1) numa coordenada — usado nos tooltips do mapa. */
export function fieldValueAt(grid: FieldGrid, [lon, lat]: [number, number]) {
  const [west, south, east, north] = grid.bbox;
  const c = Math.floor(((lon - west) / (east - west)) * grid.cols);
  const r = Math.floor(((north - lat) / (north - south)) * grid.rows);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
  return (decode(grid)[r * grid.cols + c] ?? 0) / 255;
}
