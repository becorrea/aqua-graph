/**
 * Parque de telemetria e camada de Active Sensing.
 *
 * Os 18 pontos instalados cobrem bem o centro e o vetor oeste da cidade e
 * deixam uma lacuna no quadrante nordeste — é essa lacuna que sustenta a
 * recomendação S-27 e as zonas de incerteza do modelo.
 */
import { northeastJunction } from "./waterNetwork";
import type { Severity } from "@/types";

export type SensorType = "Pressão" | "Vazão" | "Pressão + vazão" | "Nível" | "Qualidade";

export type Sensor = {
  id: string;
  type: SensorType;
  sector: string;
  x: number;
  y: number;
  status: Severity;
  reading: string;
  uptime: number;
};

export const sensors: Sensor[] = [
  {
    id: "S-01",
    type: "Pressão",
    sector: "12-A",
    x: 168,
    y: 180,
    status: "normal",
    reading: "34,2 mca",
    uptime: 99.6,
  },
  {
    id: "S-02",
    type: "Vazão",
    sector: "12-A",
    x: 268,
    y: 132,
    status: "normal",
    reading: "62,4 L/s",
    uptime: 99.1,
  },
  {
    id: "S-03",
    type: "Pressão",
    sector: "05-E",
    x: 386,
    y: 108,
    status: "normal",
    reading: "31,8 mca",
    uptime: 98.7,
  },
  {
    id: "S-04",
    type: "Vazão",
    sector: "05-E",
    x: 472,
    y: 166,
    status: "normal",
    reading: "48,1 L/s",
    uptime: 99.4,
  },
  {
    id: "S-05",
    type: "Pressão",
    sector: "12-A",
    x: 142,
    y: 300,
    status: "normal",
    reading: "36,5 mca",
    uptime: 97.9,
  },
  {
    id: "S-06",
    type: "Pressão + vazão",
    sector: "12-A",
    x: 232,
    y: 246,
    status: "normal",
    reading: "33,1 mca · 58 L/s",
    uptime: 99.8,
  },
  {
    id: "S-07",
    type: "Pressão",
    sector: "14-B",
    x: 352,
    y: 262,
    status: "critical",
    reading: "27,4 mca",
    uptime: 99.2,
  },
  {
    id: "S-08",
    type: "Vazão",
    sector: "14-B",
    x: 470,
    y: 262,
    status: "high",
    reading: "81,6 L/s",
    uptime: 98.4,
  },
  {
    id: "S-09",
    type: "Pressão + vazão",
    sector: "14-B",
    x: 412,
    y: 348,
    status: "attention",
    reading: "29,8 mca · 76 L/s",
    uptime: 99.5,
  },
  {
    id: "S-10",
    type: "Vazão",
    sector: "08-C",
    x: 206,
    y: 404,
    status: "high",
    reading: "71,2 L/s",
    uptime: 96.8,
  },
  {
    id: "S-11",
    type: "Pressão",
    sector: "08-C",
    x: 296,
    y: 470,
    status: "normal",
    reading: "32,7 mca",
    uptime: 99.0,
  },
  {
    id: "S-12",
    type: "Vazão",
    sector: "08-C",
    x: 168,
    y: 492,
    status: "normal",
    reading: "54,9 L/s",
    uptime: 98.2,
  },
  {
    id: "S-13",
    type: "Pressão",
    sector: "29-F",
    x: 388,
    y: 536,
    status: "normal",
    reading: "35,4 mca",
    uptime: 99.7,
  },
  {
    id: "S-14",
    type: "Pressão + vazão",
    sector: "29-F",
    x: 498,
    y: 462,
    status: "normal",
    reading: "34,0 mca · 44 L/s",
    uptime: 99.3,
  },
  {
    id: "S-15",
    type: "Nível",
    sector: "29-F",
    x: 592,
    y: 560,
    status: "attention",
    reading: "2,74 m",
    uptime: 98.9,
  },
  {
    id: "S-16",
    type: "Vazão",
    sector: "33-G",
    x: 598,
    y: 296,
    status: "normal",
    reading: "39,6 L/s",
    uptime: 99.5,
  },
  {
    id: "S-17",
    type: "Pressão",
    sector: "21-D",
    x: 860,
    y: 472,
    status: "attention",
    reading: "28,9 mca",
    uptime: 95.4,
  },
  {
    id: "S-18",
    type: "Vazão",
    sector: "21-D",
    x: 760,
    y: 596,
    status: "normal",
    reading: "46,3 L/s",
    uptime: 99.1,
  },
];

/** Raio de influência informacional de um ponto de telemetria, em unidades de mapa. */
export const COVERAGE_RADIUS = 84;

/** Regiões onde o modelo opera com pouca evidência direta. */
export const uncertaintyZones = [
  { id: "U-01", x: 726, y: 178, rx: 150, ry: 116, level: "critical" as Severity },
  { id: "U-02", x: 860, y: 300, rx: 112, ry: 100, level: "high" as Severity },
  { id: "U-03", x: 676, y: 430, rx: 104, ry: 86, level: "attention" as Severity },
  { id: "U-04", x: 300, y: 596, rx: 96, ry: 74, level: "attention" as Severity },
];

export type SensorRecommendation = {
  id: string;
  location: string;
  sector: string;
  type: SensorType;
  x: number;
  y: number;
  coverageBefore: number;
  coverageAfter: number;
  uncertaintyBefore: number;
  uncertaintyAfter: number;
  earlyDetectionGain: number;
  sectorsBenefited: number;
  confidence: number;
  estimatedCost: string;
  payback: string;
};

export const sensorRecommendation: SensorRecommendation = {
  id: "S-27",
  location: "Interseção hidráulica — Setor 17-C",
  sector: "17-C",
  type: "Pressão + vazão",
  x: northeastJunction.x,
  y: northeastJunction.y,
  coverageBefore: 68,
  coverageAfter: 89,
  uncertaintyBefore: 31,
  uncertaintyAfter: 13,
  earlyDetectionGain: 24,
  sectorsBenefited: 3,
  confidence: 86,
  estimatedCost: "R$ 38,4 mil",
  payback: "11 meses",
};

/** Justificativa exibida no painel de explicabilidade do Active Sensing. */
export const sensingRationale = [
  {
    title: "Alta variabilidade hidráulica",
    detail: "Pressão no trecho oscila 11 mca entre ciclos diurno e noturno.",
    weight: 92,
  },
  {
    title: "Baixa cobertura de sensores",
    detail: "Nenhum ponto de telemetria em um raio de 1,9 km.",
    weight: 88,
  },
  {
    title: "Interseção de três setores",
    detail: "17-C, 33-G e 41-H compartilham a mesma derivação de adutora.",
    weight: 81,
  },
  {
    title: "Histórico de incidentes",
    detail: "4 ocorrências de desabastecimento nos últimos 24 meses.",
    weight: 74,
  },
  {
    title: "Alto impacto informacional",
    detail: "Maior redução de entropia por ponto instalado da rede atual.",
    weight: 95,
  },
];

/** Ranking de locais candidatos — S-27 lidera o ganho informacional. */
export const sensingCandidates = [
  { id: "S-27", location: "Interseção 17-C", gain: 21, uncertainty: -18, priority: "Alta" },
  { id: "S-28", location: "Anel leste 41-H", gain: 12, uncertainty: -9, priority: "Média" },
  { id: "S-29", location: "Derivação 21-D", gain: 9, uncertainty: -7, priority: "Média" },
  { id: "S-30", location: "Divisa 08-C / 29-F", gain: 6, uncertainty: -4, priority: "Baixa" },
];

export const sensingViews = [
  { id: "coverage", label: "Cobertura atual" },
  { id: "uncertainty", label: "Incerteza" },
  { id: "recommendation", label: "Recomendação IA" },
] as const;

export type SensingView = (typeof sensingViews)[number]["id"];
