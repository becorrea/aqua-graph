/**
 * Utilitários geométricos do build. Trabalham em metros numa projeção local
 * equiretangular centrada na cidade — precisa o bastante para um recorte de
 * ~10 km e muito mais simples que reprojetar em UTM.
 */
import { CITY } from "./config.mjs";

const [LON0, LAT0] = CITY.center;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_540;

export const toXY = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
export const toLL = ([x, y]) => [LON0 + x / KX, LAT0 + y / KY];
export const round = (value, digits = 5) => Math.round(value * 10 ** digits) / 10 ** digits;
export const llRound = ([lon, lat]) => [round(lon), round(lat)];

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += dist(points[i - 1], points[i]);
  return total;
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(polygon) {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  }
  return Math.abs(area / 2);
}

export function polygonCentroid(polygon) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const f = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    cx += (polygon[j][0] + polygon[i][0]) * f;
    cy += (polygon[j][1] + polygon[i][1]) * f;
    a += f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Recorte de polígono por polígono convexo (Sutherland–Hodgman). */
export function clipPolygon(subject, clip) {
  const ccw = signedArea(clip) > 0;
  const inside = (p, a, b) => {
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return ccw ? cross >= 0 : cross <= 0;
  };
  const intersect = (p1, p2, a, b) => {
    const d = (p1[0] - p2[0]) * (a[1] - b[1]) - (p1[1] - p2[1]) * (a[0] - b[0]);
    const t = ((p1[0] - a[0]) * (a[1] - b[1]) - (p1[1] - a[1]) * (a[0] - b[0])) / d;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  let output = subject;
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      if (inside(current, a, b)) {
        if (!inside(previous, a, b)) output.push(intersect(previous, current, a, b));
        output.push(current);
      } else if (inside(previous, a, b)) {
        output.push(intersect(previous, current, a, b));
      }
    }
    if (output.length === 0) break;
  }
  return output;
}

/** Área com sinal (fórmula do laço): positiva para polígonos anti-horários. */
function signedArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Douglas–Peucker com tolerância em metros. */
export function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = segmentDistance(points[i], points[start], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (maxDistance > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Distância de um ponto a uma polilinha. */
export function polylineDistance(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1)
    best = Math.min(best, segmentDistance(p, line[i - 1], line[i]));
  return best;
}

/** Ponto a uma fração do comprimento da polilinha. */
export function pointAlong(line, fraction) {
  const total = lineLength(line);
  let target = total * fraction;
  for (let i = 1; i < line.length; i += 1) {
    const seg = dist(line[i - 1], line[i]);
    if (target <= seg) {
      const t = seg === 0 ? 0 : target / seg;
      return [
        line[i - 1][0] + t * (line[i][0] - line[i - 1][0]),
        line[i - 1][1] + t * (line[i][1] - line[i - 1][1]),
      ];
    }
    target -= seg;
  }
  return line[line.length - 1];
}

/** Divide uma polilinha em trechos de no máximo `maxLength` metros. */
export function splitLine(line, maxLength) {
  const total = lineLength(line);
  const parts = Math.max(1, Math.ceil(total / maxLength));
  if (parts === 1) return [line];
  const pieceLength = total / parts;
  const pieces = [];
  let current = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i += 1) {
    let a = line[i - 1];
    const b = line[i];
    let seg = dist(a, b);
    while (acc + seg >= pieceLength && pieces.length < parts - 1) {
      const t = (pieceLength - acc) / seg;
      const cut = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      current.push(cut);
      pieces.push(current);
      current = [cut];
      a = cut;
      seg = dist(a, b);
      acc = 0;
    }
    current.push(b);
    acc += seg;
  }
  pieces.push(current);
  return pieces.filter((piece) => piece.length >= 2);
}

/**
 * Recorta uma polilinha num polígono, devolvendo os trechos internos.
 * Trabalha por segmento (os vértices do OSM são densos o bastante).
 */
export function clipLine(line, polygon) {
  const pieces = [];
  let current = [];
  for (let i = 0; i < line.length; i += 1) {
    if (pointInPolygon(line[i], polygon)) {
      current.push(line[i]);
    } else if (current.length) {
      if (current.length >= 2) pieces.push(current);
      current = [];
    }
  }
  if (current.length >= 2) pieces.push(current);
  return pieces;
}

// ---------------------------------------------------------------------------
// Pseudoaleatório determinístico — os atributos simulados (material, ano de
// instalação, capacidade) não mudam entre execuções do build.
// ---------------------------------------------------------------------------

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seedText) {
  let a = hashString(seedText);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpolação bilinear numa grade regular (norte → sul, oeste → leste). */
export function makeGridSampler({ bbox, cols, rows, values }) {
  const [west, south, east, north] = bbox;
  return ([lon, lat]) => {
    const fx = Math.min(cols - 1.0001, Math.max(0, ((lon - west) / (east - west)) * (cols - 1)));
    const fy = Math.min(rows - 1.0001, Math.max(0, ((north - lat) / (north - south)) * (rows - 1)));
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    const tx = fx - c;
    const ty = fy - r;
    const v = (rr, cc) => values[rr * cols + cc];
    return (
      v(r, c) * (1 - tx) * (1 - ty) +
      v(r, c + 1) * tx * (1 - ty) +
      v(r + 1, c) * (1 - tx) * ty +
      v(r + 1, c + 1) * tx * ty
    );
  };
}
