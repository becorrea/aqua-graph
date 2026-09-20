/**
 * Geometria sintética de Ribeirão das Águas — SP.
 *
 * Toda a cartografia do AquaGraph é desenhada em um sistema de coordenadas
 * próprio de 1000x700 unidades, sem dependência de serviços externos de mapa.
 * A malha urbana é gerada a partir de dois eixos rotacionados (como acontece em
 * cidades reais loteadas em grelha inclinada) e concatenada em poucos `path`
 * para manter o custo de renderização baixo mesmo com centenas de quadras.
 *
 * O gerador usa PRNG determinístico: a cidade precisa ser byte-a-byte idêntica
 * no servidor e no cliente, caso contrário a hidratação do SSR quebraria.
 */
import type { Point } from "@/types";

export const MAP = { width: 1000, height: 700 } as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260126);

const round = (n: number) => Math.round(n * 10) / 10;
const moveTo = (p: Point) => `M${round(p.x)} ${round(p.y)}`;
const lineTo = (p: Point) => `L${round(p.x)} ${round(p.y)}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ---------------------------------------------------------------------------
// Malha urbana
// ---------------------------------------------------------------------------

const GRID_ANGLE = (17 * Math.PI) / 180;
const GRID_ORIGIN: Point = { x: 468, y: 326 };
const AVENUE_SPACING = 58;
const STREET_SPACING = 74;

const AXIS_U: Point = { x: Math.cos(GRID_ANGLE), y: Math.sin(GRID_ANGLE) };
const AXIS_V: Point = { x: -Math.sin(GRID_ANGLE), y: Math.cos(GRID_ANGLE) };

/**
 * Converte coordenadas da grelha urbana (metros ao longo das avenidas `a` e das
 * transversais `b`) para o espaço do mapa.
 */
export function gridPoint(a: number, b: number): Point {
  return {
    x: GRID_ORIGIN.x + AXIS_U.x * a + AXIS_V.x * b,
    y: GRID_ORIGIN.y + AXIS_U.y * a + AXIS_V.y * b,
  };
}

export const gridSpacing = { avenue: AVENUE_SPACING, street: STREET_SPACING };

/** Vetores unitários da grelha — usados para traçar redes paralelas às vias. */
export const gridAxes = { u: AXIS_U, v: AXIS_V };

const AVENUE_INDEXES = range(-10, 10);
const STREET_INDEXES = range(-9, 9);
const AVENUE_REACH = 700;
const STREET_REACH = 620;

const arterialSegments: string[] = [];
const secondarySegments: string[] = [];
const localSegments: string[] = [];

for (const b of AVENUE_INDEXES) {
  const offset = b * AVENUE_SPACING;
  const d = `${moveTo(gridPoint(-AVENUE_REACH, offset))} ${lineTo(gridPoint(AVENUE_REACH, offset))}`;
  (b % 3 === 0 ? arterialSegments : secondarySegments).push(d);
}

for (const a of STREET_INDEXES) {
  const offset = a * STREET_SPACING;
  const d = `${moveTo(gridPoint(offset, -STREET_REACH))} ${lineTo(gridPoint(offset, STREET_REACH))}`;
  (a % 4 === 0 ? arterialSegments : secondarySegments).push(d);
}

// Vias locais: meio-quarteirão, com extensões parciais para evitar a aparência
// de papel milimetrado.
for (const b of AVENUE_INDEXES) {
  if (random() < 0.22) continue;
  const offset = (b + 0.5) * AVENUE_SPACING;
  const start = -620 + random() * 420;
  const span = 260 + random() * 580;
  localSegments.push(
    `${moveTo(gridPoint(start, offset))} ${lineTo(gridPoint(start + span, offset))}`,
  );
}

for (const a of STREET_INDEXES) {
  if (random() < 0.18) continue;
  const offset = (a + 0.5) * STREET_SPACING;
  const start = -560 + random() * 360;
  const span = 240 + random() * 520;
  localSegments.push(
    `${moveTo(gridPoint(offset, start))} ${lineTo(gridPoint(offset, start + span))}`,
  );
}

export const streetLayers = {
  arterial: arterialSegments.join(" "),
  secondary: secondarySegments.join(" "),
  local: localSegments.join(" "),
};

// ---------------------------------------------------------------------------
// Quadras (tecido urbano)
// ---------------------------------------------------------------------------

function shrinkQuad(corners: Point[], factor: number): Point[] {
  const cx = corners.reduce((sum, p) => sum + p.x, 0) / corners.length;
  const cy = corners.reduce((sum, p) => sum + p.y, 0) / corners.length;
  return corners.map((p) => ({
    x: p.x + (cx - p.x) * factor,
    y: p.y + (cy - p.y) * factor,
  }));
}

function polygonPath(points: Point[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  return `${moveTo(first)} ${rest.map((p) => lineTo(p)).join(" ")} Z`;
}

/** Resolve uma sequência de nós nomeados, ignorando chaves inexistentes. */
function nodePath(keys: string[]): Point[] {
  return keys.flatMap((key) => {
    const node = NODES[key];
    return node ? [node] : [];
  });
}

const blockPaths: string[] = [];

for (const b of AVENUE_INDEXES.slice(0, -1)) {
  for (const a of STREET_INDEXES.slice(0, -1)) {
    const b0 = b * AVENUE_SPACING;
    const b1 = b0 + AVENUE_SPACING;
    const a0 = a * STREET_SPACING;

    const center = gridPoint(a0 + STREET_SPACING / 2, b0 + AVENUE_SPACING / 2);
    const visible =
      center.x > -70 && center.x < MAP.width + 70 && center.y > -70 && center.y < MAP.height + 70;
    if (!visible) continue;
    if (random() < 0.19) continue;

    const slices = random() < 0.42 ? 2 : 1;
    for (let slice = 0; slice < slices; slice += 1) {
      const start = a0 + (slice * STREET_SPACING) / slices;
      const end = a0 + ((slice + 1) * STREET_SPACING) / slices;
      blockPaths.push(
        polygonPath(
          shrinkQuad(
            [gridPoint(start, b0), gridPoint(end, b0), gridPoint(end, b1), gridPoint(start, b1)],
            0.17,
          ),
        ),
      );
    }
  }
}

export const urbanBlocksPath = blockPaths.join(" ");

// ---------------------------------------------------------------------------
// Vias estruturais, hidrografia e relevo
// ---------------------------------------------------------------------------

export const ringRoadPath =
  "M148 252C208 130 378 76 540 94C702 112 862 176 902 300C936 412 856 522 700 568C540 614 328 592 214 498C126 426 110 342 148 252Z";

export const expresswayPaths = [
  "M-20 178C162 216 302 288 432 354C568 422 732 472 1020 488",
  "M962 96C822 190 700 292 560 374C430 450 300 522 -20 602",
];

export const riverPath =
  "M196 -30C214 70 252 122 268 198C286 282 332 316 356 388C380 458 424 500 470 556C508 604 540 648 556 730";

export const tributaryPath = "M712 52C668 136 604 178 524 232C472 268 414 306 358 386";

export const canalPaths = [
  "M268 198C340 210 420 206 506 190C562 180 604 166 646 146",
  "M470 556C560 540 646 546 726 574C780 592 818 604 864 606",
];

export const waterBodies = [
  "M772 118C804 104 842 114 856 140C868 164 850 190 820 196C788 202 758 186 754 160C751 140 758 126 772 118Z",
  "M118 486C146 476 178 486 186 506C194 526 174 546 146 546C118 546 100 528 104 508C106 496 110 490 118 486Z",
];

/** Curvas de nível do relevo nordeste — camada "Topografia". */
export const contourPaths = [
  "M640 88C720 52 830 58 892 106C944 146 950 206 906 246C850 296 740 300 672 260C614 226 600 140 640 88",
  "M668 108C734 80 822 86 872 124C912 156 916 202 880 234C834 274 746 276 692 244C646 216 636 136 668 108",
  "M700 130C750 110 812 116 848 144C878 168 880 200 852 222C818 250 756 250 718 226C686 206 678 148 700 130",
];

// ---------------------------------------------------------------------------
// Setores de abastecimento
// ---------------------------------------------------------------------------

const RAW_NODES: Record<string, Point> = {
  a: { x: 44, y: 128 },
  b: { x: 158, y: 62 },
  c: { x: 336, y: 44 },
  d: { x: 522, y: 62 },
  e: { x: 702, y: 40 },
  f: { x: 862, y: 92 },
  g: { x: 958, y: 192 },
  h: { x: 966, y: 352 },
  i: { x: 928, y: 502 },
  j: { x: 842, y: 612 },
  k: { x: 662, y: 664 },
  l: { x: 432, y: 656 },
  m: { x: 252, y: 620 },
  n: { x: 122, y: 540 },
  o: { x: 54, y: 402 },
  p1: { x: 302, y: 202 },
  p2: { x: 522, y: 182 },
  p3: { x: 732, y: 192 },
  p4: { x: 302, y: 402 },
  p5: { x: 522, y: 392 },
  p6: { x: 742, y: 402 },
  p7: { x: 402, y: 532 },
  p8: { x: 662, y: 522 },
};

// Jitter leve para que as divisas pareçam levantadas em campo, e não traçadas
// com régua. Aplicado uma única vez sobre os vértices compartilhados, o que
// mantém os setores perfeitamente encaixados.
const NODES: Record<string, Point> = Object.fromEntries(
  Object.entries(RAW_NODES).map(([key, point]) => [
    key,
    { x: round(point.x + (random() - 0.5) * 11), y: round(point.y + (random() - 0.5) * 11) },
  ]),
);

export const cityBoundaryPath = polygonPath(
  nodePath(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o"]),
);

type SectorShape = { id: string; district: string; nodes: string[] };

const SECTOR_SHAPES: SectorShape[] = [
  { id: "12-A", district: "Centro Norte", nodes: ["a", "b", "c", "p1", "p4", "o"] },
  { id: "05-E", district: "Jd. das Flores", nodes: ["c", "d", "p2", "p1"] },
  { id: "17-C", district: "Alto da Serra", nodes: ["d", "e", "f", "g", "p3", "p2"] },
  { id: "14-B", district: "Centro", nodes: ["p1", "p2", "p5", "p4"] },
  { id: "33-G", district: "Vila Industrial", nodes: ["p2", "p3", "p6", "p5"] },
  { id: "41-H", district: "Parque Ribeirão", nodes: ["p3", "g", "h", "p6"] },
  { id: "08-C", district: "Vila Nova", nodes: ["o", "p4", "p7", "l", "m", "n"] },
  { id: "29-F", district: "Jd. Aeroporto", nodes: ["p4", "p5", "p8", "k", "l", "p7"] },
  { id: "21-D", district: "Jd. Paulista", nodes: ["p5", "p6", "h", "i", "j", "k", "p8"] },
];

/** Centroide de área — evita que rótulos de setores em "L" caiam fora da forma. */
function polygonCentroid(points: Point[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    const cross = current.x * next.y - next.x * current.y;
    area += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) {
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
  }
  return { x: round(cx / (6 * area)), y: round(cy / (6 * area)) };
}

export type SectorGeometry = {
  id: string;
  district: string;
  path: string;
  centroid: Point;
};

export const sectorGeometry: SectorGeometry[] = SECTOR_SHAPES.map((shape) => {
  const points = nodePath(shape.nodes);
  return {
    id: shape.id,
    district: shape.district,
    path: polygonPath(points),
    centroid: polygonCentroid(points),
  };
});

export const sectorById = new Map(sectorGeometry.map((sector) => [sector.id, sector]));

export function sectorCentroid(id: string): Point {
  return sectorById.get(id)?.centroid ?? { x: MAP.width / 2, y: MAP.height / 2 };
}
