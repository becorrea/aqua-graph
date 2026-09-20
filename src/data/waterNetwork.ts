/**
 * Rede hidráulica e de drenagem de Ribeirão das Águas.
 *
 * As redes de distribuição acompanham o traçado das vias (como na prática), por
 * isso são derivadas da mesma grelha que gera a malha urbana em `cityGeometry`.
 * Adutoras, nós e trechos prioritários são cadastrados individualmente porque
 * possuem identidade operacional (aparecem em ordens de serviço e no drawer).
 */
import { gridAxes, gridPoint, gridSpacing } from "./cityGeometry";
import type { Point, Severity } from "@/types";

const round = (n: number) => Math.round(n * 10) / 10;
const moveTo = (p: Point) => `M${round(p.x)} ${round(p.y)}`;
const lineTo = (p: Point) => `L${round(p.x)} ${round(p.y)}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Deslocamento lateral em relação ao eixo da via: a tubulação não fica no meio
// do asfalto, e esse detalhe evita que rede e rua virem uma única linha grossa.
const PIPE_OFFSET = 13;

const primarySegments: string[] = [];
const secondarySegments: string[] = [];

for (const b of range(-10, 10)) {
  const offset = b * gridSpacing.avenue + PIPE_OFFSET;
  const d = `${moveTo(gridPoint(-640, offset))} ${lineTo(gridPoint(640, offset))}`;
  if (b % 3 === 0) primarySegments.push(d);
  else if (b % 2 === 0) secondarySegments.push(d);
}

for (const a of range(-9, 9)) {
  const offset = a * gridSpacing.street + PIPE_OFFSET;
  const d = `${moveTo(gridPoint(offset, -560))} ${lineTo(gridPoint(offset, 560))}`;
  if (a % 4 === 0) primarySegments.push(d);
  else if (a % 2 !== 0) secondarySegments.push(d);
}

export const distributionNetwork = {
  primary: primarySegments.join(" "),
  secondary: secondarySegments.join(" "),
};

/** Nó hidráulico onde convergem as adutoras do centro expandido. */
export const centralJunction: Point = { x: 412, y: 348 };

/** Interseção de três setores no Alto da Serra — alvo da recomendação S-27. */
export const northeastJunction: Point = { x: 716, y: 206 };

/**
 * Adutoras acompanham corredores viários: percorrem trechos paralelos aos eixos
 * da grelha e viram em esquinas chanfradas. Traçá-las com curvas livres faria a
 * rede parecer hidrografia, e não infraestrutura enterrada.
 */
type RoutePattern = "uv" | "vu" | "uvu" | "vuv";

const CORNER_RADIUS = 13;

function project(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    u: dx * gridAxes.u.x + dy * gridAxes.u.y,
    v: dx * gridAxes.v.x + dy * gridAxes.v.y,
  };
}

function legsFor(from: Point, to: Point, pattern: RoutePattern) {
  const { u, v } = project(from, to);
  switch (pattern) {
    case "uv":
      return [
        { axis: "u" as const, length: u },
        { axis: "v" as const, length: v },
      ];
    case "vu":
      return [
        { axis: "v" as const, length: v },
        { axis: "u" as const, length: u },
      ];
    case "uvu":
      return [
        { axis: "u" as const, length: u * 0.58 },
        { axis: "v" as const, length: v },
        { axis: "u" as const, length: u * 0.42 },
      ];
    case "vuv":
      return [
        { axis: "v" as const, length: v * 0.55 },
        { axis: "u" as const, length: u },
        { axis: "v" as const, length: v * 0.45 },
      ];
  }
}

function shift(point: Point, axis: "u" | "v", length: number): Point {
  const vector = gridAxes[axis];
  return { x: point.x + vector.x * length, y: point.y + vector.y * length };
}

/** Traça um corredor ortogonal à grelha entre dois pontos, com esquinas suaves. */
function corridor(from: Point, to: Point, pattern: RoutePattern): string {
  const vertices: Point[] = [from];
  let cursor = from;
  for (const leg of legsFor(from, to, pattern)) {
    cursor = shift(cursor, leg.axis, leg.length);
    vertices.push(cursor);
  }

  let d = moveTo(vertices[0] ?? from);
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const previous = vertices[i - 1];
    const corner = vertices[i];
    const next = vertices[i + 1];
    if (!previous || !corner || !next) continue;
    const radius = Math.min(
      CORNER_RADIUS,
      Math.hypot(corner.x - previous.x, corner.y - previous.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    );
    const inbound = unit(previous, corner);
    const outbound = unit(corner, next);
    const entry = { x: corner.x - inbound.x * radius, y: corner.y - inbound.y * radius };
    const exit = { x: corner.x + outbound.x * radius, y: corner.y + outbound.y * radius };
    d += ` ${lineTo(entry)} Q${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`;
  }
  return `${d} ${lineTo(to)}`;
}

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

const RES_NORTH: Point = { x: 612, y: 126 };
const RES_CENTRAL: Point = { x: 196, y: 300 };
const RES_SOUTH: Point = { x: 556, y: 566 };
const EAST_BOOSTER: Point = { x: 866, y: 500 };
const SOUTHWEST_END: Point = { x: 340, y: 556 };

export type TrunkMain = {
  id: string;
  label: string;
  diameter: string;
  d: string;
};

export const trunkMains: TrunkMain[] = [
  {
    id: "AD-01",
    label: "Adutora Norte",
    diameter: "DN 800",
    d: corridor(RES_NORTH, centralJunction, "vuv"),
  },
  {
    id: "AD-02",
    label: "Adutora Centro-Oeste",
    diameter: "DN 600",
    d: corridor(RES_CENTRAL, centralJunction, "uvu"),
  },
  {
    id: "AD-03",
    label: "Adutora Sul",
    diameter: "DN 700",
    d: corridor(RES_SOUTH, centralJunction, "vu"),
  },
  {
    id: "AD-04",
    label: "Adutora Leste",
    diameter: "DN 500",
    d: `${corridor(RES_NORTH, northeastJunction, "uv")} ${corridor(northeastJunction, EAST_BOOSTER, "vuv")}`,
  },
  {
    id: "AD-05",
    label: "Adutora Vila Nova",
    diameter: "DN 400",
    d: corridor(RES_CENTRAL, SOUTHWEST_END, "vuv"),
  },
  {
    id: "AD-06",
    label: "Interligação Leste",
    diameter: "DN 450",
    d: corridor(northeastJunction, centralJunction, "uvu"),
  },
];

/** Coletores de drenagem urbana — acompanham os talvegues até o rio. */
export const drainageNetwork = {
  mains: [
    "M96 236C182 268 268 296 336 348C396 394 430 452 470 556",
    "M636 96C610 168 588 236 546 296C506 354 452 386 412 424C380 454 360 490 352 540",
    "M912 274C842 322 776 366 716 414C660 458 606 502 556 560",
    "M236 596C296 552 348 508 396 456C436 412 456 380 470 342",
  ],
  laterals: [
    "M180 320L246 358",
    "M300 236L344 288",
    "M486 214L520 268",
    "M604 268L648 324",
    "M700 348L748 396",
    "M382 496L430 534",
    "M540 452L588 494",
    "M258 430L312 466",
    "M812 402L860 446",
    "M474 148L506 198",
  ],
};

export type NetworkNode = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  level: Severity;
};

export const pumpStations: NetworkNode[] = [
  { id: "EB-01", label: "EB-01", detail: "Elevatória Vila Nova", x: 262, y: 462, level: "normal" },
  { id: "EB-03", label: "EB-03", detail: "Elevatória Centro", x: 412, y: 348, level: "normal" },
  {
    id: "EB-05",
    label: "EB-05",
    detail: "Elevatória Jd. Paulista",
    x: 776,
    y: 372,
    level: "normal",
  },
  {
    id: "EB-07",
    label: "EB-07",
    detail: "Elevatória Ribeirão",
    x: 470,
    y: 556,
    level: "attention",
  },
];

export const valves: NetworkNode[] = [
  {
    id: "VRP-11",
    label: "VRP-11",
    detail: "Válvula redutora de pressão",
    x: 470,
    y: 262,
    level: "normal",
  },
  {
    id: "VRP-14",
    label: "VRP-14",
    detail: "Válvula redutora de pressão",
    x: 344,
    y: 322,
    level: "attention",
  },
  {
    id: "VRP-18",
    label: "VRP-18",
    detail: "Válvula redutora de pressão",
    x: 446,
    y: 412,
    level: "normal",
  },
  {
    id: "VS-22",
    label: "VS-22",
    detail: "Válvula de setorização",
    x: 696,
    y: 178,
    level: "normal",
  },
  {
    id: "VS-27",
    label: "VS-27",
    detail: "Válvula de setorização",
    x: 776,
    y: 372,
    level: "normal",
  },
  {
    id: "VS-31",
    label: "VS-31",
    detail: "Válvula de setorização",
    x: 226,
    y: 414,
    level: "normal",
  },
  {
    id: "VS-34",
    label: "VS-34",
    detail: "Válvula de setorização",
    x: 540,
    y: 292,
    level: "attention",
  },
  { id: "VM-41", label: "VM-41", detail: "Válvula de manobra", x: 600, y: 258, level: "normal" },
  { id: "VM-46", label: "VM-46", detail: "Válvula de manobra", x: 318, y: 530, level: "normal" },
  { id: "VM-52", label: "VM-52", detail: "Válvula de manobra", x: 828, y: 480, level: "normal" },
];

export type CriticalFacility = {
  id: string;
  label: string;
  kind: "Hospital" | "Escola" | "Terminal" | "ETA" | "Defesa Civil";
  x: number;
  y: number;
};

export const criticalFacilities: CriticalFacility[] = [
  { id: "HOSP-C", label: "Hospital C — Vila Nova", kind: "Hospital", x: 300, y: 452 },
  { id: "ESC-D", label: "Escola D — Jd. Paulista", kind: "Escola", x: 638, y: 452 },
  { id: "TERM-E", label: "Terminal E — Centro", kind: "Terminal", x: 462, y: 366 },
  { id: "ETA-01", label: "ETA Ribeirão", kind: "ETA", x: 676, y: 88 },
  { id: "DC-01", label: "Defesa Civil — Sede", kind: "Defesa Civil", x: 502, y: 232 },
];

/** Trechos candidatos a vazamento no setor 14-B, ordenados por probabilidade. */
export type PriorityPipe = {
  id: string;
  label: string;
  probability: number;
  diameter: string;
  material: string;
  length: string;
  installedIn: number;
  d: string;
};

export const priorityPipes: PriorityPipe[] = [
  {
    id: "TB-481",
    label: "Tubo 481",
    probability: 87,
    diameter: "DN 150",
    material: "Ferro fundido",
    length: "218 m",
    installedIn: 1987,
    d: "M352 262L412 294L470 274",
  },
  {
    id: "TB-487",
    label: "Tubo 487",
    probability: 79,
    diameter: "DN 100",
    material: "PVC",
    length: "164 m",
    installedIn: 1994,
    d: "M412 294L428 356",
  },
  {
    id: "TB-492",
    label: "Tubo 492",
    probability: 68,
    diameter: "DN 150",
    material: "Ferro fundido",
    length: "192 m",
    installedIn: 1982,
    d: "M352 262L332 328",
  },
];

export type MapLayerId =
  | "boundary"
  | "sectors"
  | "network"
  | "pressure"
  | "consumption"
  | "leak-probability"
  | "anomalies"
  | "sensors"
  | "reservoirs"
  | "drainage"
  | "flood-risk"
  | "rain-radar"
  | "river-level"
  | "topography"
  | "critical-infra"
  | "drought-risk"
  | "coverage"
  | "uncertainty"
  | "recommendation";

export type MapVariant = "overview" | "leaks" | "drought" | "flood" | "sensing";

export type MapLayerOption = { id: MapLayerId; label: string; on: boolean };

/**
 * Cada módulo expõe o seu próprio painel de camadas — é assim que sistemas GIS
 * operacionais evitam listas de 30 itens irrelevantes para a tarefa em curso.
 */
export const mapLayerCatalog: Record<MapVariant, MapLayerOption[]> = {
  overview: [
    { id: "network", label: "Rede de água", on: true },
    { id: "sectors", label: "Setores de abastecimento", on: true },
    { id: "leak-probability", label: "Prob. de vazamento (IA)", on: true },
    { id: "reservoirs", label: "Reservatórios", on: true },
    { id: "sensors", label: "Sensores IoT", on: true },
    { id: "anomalies", label: "Anomalias recentes", on: true },
    { id: "critical-infra", label: "Infraestrutura crítica", on: false },
    { id: "drainage", label: "Rede de drenagem", on: false },
    { id: "boundary", label: "Limites da cidade", on: true },
  ],
  leaks: [
    { id: "network", label: "Rede de água", on: true },
    { id: "sectors", label: "Setores de abastecimento", on: true },
    { id: "leak-probability", label: "Prob. de vazamento (IA)", on: true },
    { id: "pressure", label: "Pressão na rede", on: false },
    { id: "consumption", label: "Consumo por setor", on: false },
    { id: "anomalies", label: "Anomalias recentes", on: true },
    { id: "sensors", label: "Sensores IoT", on: false },
    { id: "boundary", label: "Limites da cidade", on: true },
  ],
  drought: [
    { id: "drought-risk", label: "Risco de estiagem", on: true },
    { id: "reservoirs", label: "Reservatórios", on: true },
    { id: "network", label: "Rede de água", on: true },
    { id: "sectors", label: "Setores de abastecimento", on: true },
    { id: "boundary", label: "Limites da cidade", on: true },
  ],
  flood: [
    { id: "flood-risk", label: "Risco de enchente", on: true },
    { id: "rain-radar", label: "Previsão de chuva (radar)", on: true },
    { id: "river-level", label: "Nível dos rios", on: true },
    { id: "drainage", label: "Rede de drenagem", on: true },
    { id: "topography", label: "Topografia", on: false },
    { id: "critical-infra", label: "Infraestrutura crítica", on: true },
    { id: "boundary", label: "Limites da cidade", on: true },
  ],
  sensing: [
    { id: "sensors", label: "Sensores IoT", on: true },
    { id: "coverage", label: "Cobertura informacional", on: true },
    { id: "uncertainty", label: "Incerteza do modelo", on: false },
    { id: "recommendation", label: "Recomendação IA", on: true },
    { id: "network", label: "Rede de água", on: true },
    { id: "sectors", label: "Setores de abastecimento", on: false },
    { id: "boundary", label: "Limites da cidade", on: true },
  ],
};

export const networkSummary = {
  extension: "1.842 km",
  connections: "148.320 ligações",
  sectors: 9,
  reservoirs: 3,
  pumpStations: pumpStations.length,
  valves: 214,
  telemetryPoints: 18,
};
