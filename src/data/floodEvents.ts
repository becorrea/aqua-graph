/**
 * Enchentes e resposta rápida.
 *
 * O módulo combina radar de chuva, nível dos rios e capacidade de drenagem para
 * estimar quando cada ponto crítico atinge nível de alagamento.
 */
import type { MapMarker, OperationalEvent, Priority, Severity } from "@/types";

export const floodKpis = {
  forecastRain: 74,
  forecastWindow: "Próximas 3 horas",
  rainTrend: 120,
  hydrologicalRisk: "ALTO",
  riskTrend: "Tendência de aumento",
  criticalAreas: 12,
  criticalAreasTrend: 4,
  minutesToPeak: 43,
};

export const floodOccurrences: OperationalEvent[] = [
  {
    id: "OC-2211",
    place: "Rua A — Centro",
    issue: "Alagamento em andamento",
    metric: "43 min",
    metricHint: "Nível crítico em",
    level: "critical",
  },
  {
    id: "OC-2212",
    place: "Avenida B — Jd. das Flores",
    issue: "Acúmulo de água na via",
    metric: "1h20",
    metricHint: "Nível crítico em",
    level: "high",
  },
  {
    id: "OC-2213",
    place: "Hospital C — Vila Nova",
    issue: "Risco de isolamento",
    metric: "2h10",
    metricHint: "Em atenção",
    level: "attention",
  },
  {
    id: "OC-2214",
    place: "Escola D — Jd. Paulista",
    issue: "Ponto de alagamento recorrente",
    metric: "3h05",
    metricHint: "Em atenção",
    level: "attention",
  },
  {
    id: "OC-2215",
    place: "Terminal E — Centro",
    issue: "Risco de interrupção de acesso",
    metric: "3h40",
    metricHint: "Em monitoramento",
    level: "info",
  },
];

export type FloodAction = {
  id: string;
  action: string;
  rationale: string;
  time: string;
  priority: Priority;
  level: Severity;
  icon: "inspect" | "pump" | "block" | "alert";
};

export const floodActions: FloodAction[] = [
  {
    id: "FA-01",
    action: "Inspecionar galeria 231",
    rationale: "Risco de obstrução identificado pelo histórico de manutenção",
    time: "15 min",
    priority: "Alta",
    level: "critical",
    icon: "inspect",
  },
  {
    id: "FA-02",
    action: "Mobilizar equipe para bomba 07",
    rationale: "Nível do rio em elevação acelerada a montante",
    time: "20 min",
    priority: "Alta",
    level: "critical",
    icon: "pump",
  },
  {
    id: "FA-03",
    action: "Bloquear via Y",
    rationale: "Prevenção de alagamento com veículos submersos",
    time: "35 min",
    priority: "Média",
    level: "high",
    icon: "block",
  },
  {
    id: "FA-04",
    action: "Alertar Defesa Civil",
    rationale: "Áreas de risco a jusante da confluência",
    time: "Imediato",
    priority: "Média",
    level: "high",
    icon: "alert",
  },
];

/** Pontos de alagamento projetados sobre o mapa. */
export const floodHotspots: MapMarker[] = [
  {
    id: "FH-A",
    label: "Rua A",
    detail: "Risco crítico em 43 min",
    x: 392,
    y: 300,
    level: "critical",
    kind: "alert",
  },
  {
    id: "FH-B",
    label: "Avenida B",
    detail: "Alto risco em 1h20",
    x: 560,
    y: 214,
    level: "high",
    kind: "alert",
  },
  {
    id: "FH-C",
    label: "Hospital C",
    detail: "Área de atenção",
    x: 300,
    y: 452,
    level: "attention",
    kind: "facility",
  },
  {
    id: "FH-D",
    label: "Escola D",
    detail: "Atenção · 3h05",
    x: 638,
    y: 452,
    level: "attention",
    kind: "facility",
  },
  {
    id: "FH-E",
    label: "Terminal E",
    detail: "Monitoramento",
    x: 462,
    y: 366,
    level: "info",
    kind: "facility",
  },
];

/** Núcleos de calor do heatmap de inundação, do mais severo ao mais brando. */
export const floodHeatCores = [
  { x: 392, y: 300, rx: 132, ry: 104, weight: 1 },
  { x: 470, y: 254, rx: 104, ry: 84, weight: 0.86 },
  { x: 560, y: 214, rx: 96, ry: 78, weight: 0.78 },
  { x: 318, y: 380, rx: 112, ry: 92, weight: 0.72 },
  { x: 470, y: 556, rx: 118, ry: 88, weight: 0.64 },
  { x: 262, y: 216, rx: 88, ry: 72, weight: 0.52 },
  { x: 636, y: 452, rx: 92, ry: 70, weight: 0.44 },
];

/** Radar de precipitação: acumulado projetado em janelas de 30 minutos. */
export const rainForecast = [
  { time: "Agora", intensity: 22, accumulated: 8 },
  { time: "+30min", intensity: 41, accumulated: 24 },
  { time: "+1h", intensity: 58, accumulated: 41 },
  { time: "+1h30", intensity: 64, accumulated: 55 },
  { time: "+2h", intensity: 52, accumulated: 64 },
  { time: "+2h30", intensity: 38, accumulated: 70 },
  { time: "+3h", intensity: 24, accumulated: 74 },
];

export const riverLevels = [
  { time: "06h", level: 1.92, alert: 3.2, flood: 4.1 },
  { time: "07h", level: 2.04, alert: 3.2, flood: 4.1 },
  { time: "08h", level: 2.26, alert: 3.2, flood: 4.1 },
  { time: "09h", level: 2.58, alert: 3.2, flood: 4.1 },
  { time: "10h", level: 2.94, alert: 3.2, flood: 4.1 },
  { time: "11h", level: 3.36, alert: 3.2, flood: 4.1 },
  { time: "12h", level: 3.82, alert: 3.2, flood: 4.1 },
  { time: "13h", level: 4.18, alert: 3.2, flood: 4.1 },
];

/** Progressão do acumulado usada pelo botão "Simular chuva extrema". */
export const rainSimulationSteps = [12, 28, 47, 74];

export const floodAlert = {
  title: "RISCO CRÍTICO DETECTADO",
  message:
    "Rua A poderá atingir nível crítico em aproximadamente 43 minutos. Galeria 231 opera acima da capacidade projetada.",
};
