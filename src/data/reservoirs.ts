/**
 * Reservatórios de distribuição e projeção de nível.
 *
 * A série é gerada a partir do dia de referência (26 Jan 2026) para que os
 * cruzamentos com a zona crítica coincidam exatamente com os horizontes
 * divulgados nos KPIs: 53 dias no cenário base e 34 dias no cenário adverso.
 */
export const CRITICAL_LEVEL = 25;
export const REFERENCE_LEVEL = 42;

export type Reservoir = {
  id: string;
  name: string;
  level: number;
  capacity: string;
  trend: number;
  daysToCritical: number;
  supplies: string;
  x: number;
  y: number;
};

export const reservoirs: Reservoir[] = [
  {
    id: "RES-N",
    name: "Reservatório Norte",
    level: 38,
    capacity: "24.000 m³",
    trend: -9,
    daysToCritical: 38,
    supplies: "12-A · 05-E · 17-C",
    x: 612,
    y: 126,
  },
  {
    id: "RES-C",
    name: "Reservatório Central",
    level: 62,
    capacity: "31.500 m³",
    trend: -4,
    daysToCritical: 62,
    supplies: "14-B · 33-G · 29-F",
    x: 196,
    y: 300,
  },
  {
    id: "RES-S",
    name: "Reservatório Sul",
    level: 47,
    capacity: "18.200 m³",
    trend: -11,
    daysToCritical: 28,
    supplies: "08-C · 21-D · 41-H",
    x: 556,
    y: 566,
  },
];

const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const REFERENCE_DAY = Date.UTC(2026, 0, 26);
const DAY_MS = 86_400_000;

function labelFor(dayOffset: number): string {
  const date = new Date(REFERENCE_DAY + dayOffset * DAY_MS);
  return MONTHS_PT[date.getUTCMonth()] ?? "";
}

/**
 * Curva de esvaziamento: cai de `REFERENCE_LEVEL` até a zona crítica no dia
 * `criticalDay` e segue desacelerando (o consumo cede quando o sistema já opera
 * em restrição).
 */
function projection(dayOffset: number, criticalDay: number, floor: number) {
  if (dayOffset <= 0) return REFERENCE_LEVEL;
  if (dayOffset <= criticalDay) {
    const progress = dayOffset / criticalDay;
    return REFERENCE_LEVEL - (REFERENCE_LEVEL - CRITICAL_LEVEL) * progress ** 0.88;
  }
  const remaining = (dayOffset - criticalDay) / (240 - criticalDay);
  return CRITICAL_LEVEL - (CRITICAL_LEVEL - floor) * remaining ** 0.8;
}

export type ReservoirPoint = {
  day: number;
  label: string;
  observed: number | null;
  base: number | null;
  adverse: number | null;
};

const SAMPLE_DAYS = Array.from({ length: 34 }, (_, index) => -90 + index * 10);

export const reservoirTrend: ReservoirPoint[] = SAMPLE_DAYS.map((day) => ({
  day,
  label: labelFor(day),
  observed: day <= 0 ? Number((REFERENCE_LEVEL - day * 0.315).toFixed(1)) : null,
  base: day >= 0 ? Number(projection(day, 53, 15).toFixed(1)) : null,
  adverse: day >= 0 ? Number(projection(day, 34, 6).toFixed(1)) : null,
}));

/** Primeiro ponto de cada mês — usado como marcação do eixo X. */
export const monthTicks = (() => {
  const seen = new Set<string>();
  const ticks: Array<{ day: number; label: string }> = [];
  for (const point of reservoirTrend) {
    if (seen.has(point.label)) continue;
    seen.add(point.label);
    ticks.push({ day: point.day, label: point.label });
  }
  return ticks;
})();

const TICK_LABELS = new Map(monthTicks.map((tick) => [tick.day, tick.label]));

export function monthTickLabel(day: number) {
  return TICK_LABELS.get(day) ?? "";
}

export const TREND_DOMAIN: [number, number] = [-90, 240];

/** Série de um cenário simulado, usada quando o operador troca de hipótese. */
export function scenarioSeries(criticalDay: number): Array<{ day: number; value: number | null }> {
  return SAMPLE_DAYS.map((day) => ({
    day,
    value:
      day >= 0
        ? Number(projection(day, criticalDay, Math.max(4, 42 - criticalDay * 0.3)).toFixed(1))
        : null,
  }));
}

export const demandTrend = [
  { label: "Seg", demand: 1.31, supply: 1.44 },
  { label: "Ter", demand: 1.34, supply: 1.44 },
  { label: "Qua", demand: 1.36, supply: 1.43 },
  { label: "Qui", demand: 1.38, supply: 1.42 },
  { label: "Sex", demand: 1.4, supply: 1.42 },
  { label: "Sáb", demand: 1.44, supply: 1.41 },
  { label: "Dom", demand: 1.42, supply: 1.41 },
];

export const reservoirKpis = {
  level: 42,
  levelTrend: -8,
  daysToCritical: 53,
  adverseDays: 34,
  projectedDemand: 1.42,
  demandTrend: 12,
  rainfallDeficit: -38,
};
