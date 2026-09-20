/**
 * Cadastro operacional da cidade fictícia usada na demonstração.
 *
 * Os números seguem a ordem de grandeza de um município paulista de porte médio
 * atendido por concessionária: ~340 mil habitantes, 9 setores de abastecimento
 * e 3 reservatórios de distribuição.
 */
import { sectorGeometry } from "./cityGeometry";
import type { Severity } from "@/types";

export const city = {
  name: "Ribeirão das Águas",
  state: "SP",
  dateLabel: "26 Jan 2026",
  weekdayLabel: "Seg",
  timeLabel: "10:24",
  population: "341.2 mil hab.",
  systemStatus: "Operação normal",
  dataFreshness: "Dados atualizados há 2 min",
  operator: {
    initials: "AS",
    name: "Ana Silva",
    role: "Operadora",
    unit: "Centro de Controle Operacional",
  },
} as const;

export type SectorProfile = {
  id: string;
  district: string;
  population: string;
  connections: number;
  /** Nível de severidade consolidado do setor no módulo de perdas. */
  level: Severity;
  leakProbability: number;
  pressureVariation: number;
  flowVariation: number;
  lastMaintenanceDays: number;
  daysToCriticality: number;
};

const PROFILES: Omit<SectorProfile, "district">[] = [
  {
    id: "14-B",
    population: "38.4 mil hab.",
    connections: 16820,
    level: "critical",
    leakProbability: 87,
    pressureVariation: -8,
    flowVariation: 16,
    lastMaintenanceDays: 118,
    daysToCriticality: 62,
  },
  {
    id: "08-C",
    population: "52.1 mil hab.",
    connections: 22940,
    level: "high",
    leakProbability: 76,
    pressureVariation: -5,
    flowVariation: 11,
    lastMaintenanceDays: 96,
    daysToCriticality: 57,
  },
  {
    id: "21-D",
    population: "46.7 mil hab.",
    connections: 20110,
    level: "attention",
    leakProbability: 62,
    pressureVariation: -2,
    flowVariation: 8,
    lastMaintenanceDays: 74,
    daysToCriticality: 28,
  },
  {
    id: "12-A",
    population: "44.9 mil hab.",
    connections: 19480,
    level: "info",
    leakProbability: 58,
    pressureVariation: -3,
    flowVariation: 6,
    lastMaintenanceDays: 132,
    daysToCriticality: 38,
  },
  {
    id: "17-C",
    population: "29.6 mil hab.",
    connections: 12640,
    level: "normal",
    leakProbability: 34,
    pressureVariation: -1,
    flowVariation: 2,
    lastMaintenanceDays: 41,
    daysToCriticality: 71,
  },
  {
    id: "05-E",
    population: "31.8 mil hab.",
    connections: 13720,
    level: "normal",
    leakProbability: 29,
    pressureVariation: 0,
    flowVariation: 1,
    lastMaintenanceDays: 58,
    daysToCriticality: 66,
  },
  {
    id: "33-G",
    population: "27.3 mil hab.",
    connections: 9840,
    level: "normal",
    leakProbability: 31,
    pressureVariation: -1,
    flowVariation: 3,
    lastMaintenanceDays: 63,
    daysToCriticality: 59,
  },
  {
    id: "41-H",
    population: "35.5 mil hab.",
    connections: 15060,
    level: "attention",
    leakProbability: 47,
    pressureVariation: -4,
    flowVariation: 5,
    lastMaintenanceDays: 87,
    daysToCriticality: 49,
  },
  {
    id: "29-F",
    population: "34.9 mil hab.",
    connections: 14710,
    level: "normal",
    leakProbability: 36,
    pressureVariation: -2,
    flowVariation: 4,
    lastMaintenanceDays: 52,
    daysToCriticality: 44,
  },
];

const districtById = new Map(sectorGeometry.map((sector) => [sector.id, sector.district]));

export const sectorProfiles: SectorProfile[] = PROFILES.map((profile) => ({
  ...profile,
  district: districtById.get(profile.id) ?? "—",
}));

export const sectorProfileById = new Map(sectorProfiles.map((profile) => [profile.id, profile]));

/** Setores destacados nas telas operacionais, na ordem de prioridade da IA. */
export const watchedSectors = ["14-B", "08-C", "21-D", "12-A"] as const;
