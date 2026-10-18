/**
 * Contratos da API do AquaGraph (`/api/*`).
 *
 * Compartilhados entre o motor de simulação (servidor) e as telas (cliente).
 * Todo valor numérico vem com a sua origem explícita em `DataOrigin`: a
 * interface sempre consegue dizer se um número é medido de verdade, simulado
 * pelo motor ou derivado de um modelo.
 */
import type { Priority, Severity } from "./index";

/** `real`: fonte pública ao vivo · `simulado`: sensor sintético · `modelo`: cálculo do motor. */
export type DataOrigin = "real" | "simulado" | "modelo";

export type LngLat = [number, number];

export type SensorType = "flow" | "pressure" | "level" | "rain" | "river";

export type RainMode = "real" | "extreme";

export type ModuleKey = "perdas" | "seca" | "enchentes" | "sensing";

// ---------------------------------------------------------------------------
// Clima (Open-Meteo)
// ---------------------------------------------------------------------------

export type WeatherHour = {
  time: string;
  precipitation: number;
  probability: number;
  temperature: number;
};
export type WeatherDay = { date: string; precipitation: number; tmax: number; observed: boolean };

export type Weather = {
  source: "open-meteo" | "climatologia";
  fetchedAt: string;
  temperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  description: string;
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

// ---------------------------------------------------------------------------
// Sensores
// ---------------------------------------------------------------------------

export type SensorReading = {
  id: string;
  type: SensorType;
  sector: string | null;
  target: string;
  value: number;
  unit: string;
  /** Valor que o modelo hidráulico esperava para este instante. */
  expected: number | null;
  /** Desvio relativo ao esperado, em %. */
  deviation: number | null;
  level: Severity;
  /** 24 leituras horárias (mais antiga → mais recente). */
  trend: number[];
  origin: DataOrigin;
};

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

export type SectorStatus = {
  id: string;
  name: string;
  system: string;
  level: Severity;
  leakProbability: number;
  lossRate: number;
  inflow: number;
  pressureDeviation: number;
  daysToCritical: number | null;
};

export type TimelineEvent = {
  id: string;
  time: string;
  module: ModuleKey | "operacao";
  level: Severity;
  title: string;
  detail: string;
};

export type Decision = {
  id: string;
  module: ModuleKey;
  action: string;
  type: string;
  place: string;
  rationale: string;
  impact: string;
  confidence: number;
  priority: Priority;
  level: Severity;
  horizon: string;
  status: "Pendente" | "Simulada" | "Planejada" | "Em execução" | "Concluída";
  workOrder: string | null;
  lngLat: LngLat | null;
};

export type WorkOrder = {
  id: string;
  decisionId: string | null;
  title: string;
  asset: string;
  team: string;
  priority: Priority;
  deadline: string;
  status: "Aberta" | "Em execução" | "Concluída";
  createdAt: string;
};

export type ModuleHeadline = {
  module: ModuleKey;
  level: Severity;
  title: string;
  detail: string;
  metric: string;
  metricLabel: string;
  lngLat: LngLat | null;
};

export type LiveSnapshot = {
  generatedAt: string;
  clock: { iso: string; time: string; date: string };
  city: {
    name: string;
    state: string;
    population: number;
    connections: number;
    networkKm: number;
    sectors: number;
  };
  weather: Pick<
    Weather,
    "source" | "temperature" | "humidity" | "precipitation" | "description" | "fetchedAt"
  >;
  rainMode: RainMode;
  pipeline: {
    sensors: number;
    online: number;
    readingsLastHour: number;
    models: number;
    risks: number;
    criticalRisks: number;
    recommendations: number;
    openOrders: number;
    runningOrders: number;
  };
  sensors: SensorReading[];
  sectors: SectorStatus[];
  headlines: ModuleHeadline[];
  timeline: TimelineEvent[];
  topActions: Decision[];
  notifications: TimelineEvent[];
};

// ---------------------------------------------------------------------------
// Perdas e vazamentos
// ---------------------------------------------------------------------------

export type LeakEvidence = {
  id: "mnf" | "pressure" | "balance" | "consumption" | "history";
  label: string;
  reading: string;
  detail: string;
  /** Contribuição para a probabilidade (pontos de log-odds normalizados 0–100). */
  weight: number;
  level: Severity;
};

export type PipeCandidate = {
  id: string;
  street: string | null;
  diameter: number;
  material: string;
  year: number;
  lengthM: number;
  share: number;
  lngLat: LngLat;
};

export type SectorLossDetail = {
  id: string;
  name: string;
  neighborhoods: string[];
  population: number;
  connections: number;
  networkKm: number;
  leakProbability: number;
  level: Severity;
  lossRate: number;
  lostM3h: number;
  inflow: number;
  expectedInflow: number;
  consumption: number;
  pressureDeviation: number;
  mnf: number;
  expectedMnf: number;
  onset: string | null;
  evidence: LeakEvidence[];
  conclusion: string;
  candidates: PipeCandidate[];
  sensors: string[];
  /** Série de 24 h a cada 30 min. */
  day: Array<{
    time: string;
    inflow: number;
    expected: number;
    consumption: number;
    pressure: number;
    expectedPressure: number;
  }>;
  /** Vazão mínima noturna das últimas 14 noites. */
  nights: Array<{ date: string; mnf: number; expected: number }>;
};

export type LossesResponse = {
  generatedAt: string;
  city: {
    lossRate: number;
    lostM3h: number;
    inflowM3day: number;
    consumptionM3day: number;
    alertSectors: number;
    detectionLeadHours: number;
  };
  sectors: Array<
    Pick<
      SectorLossDetail,
      "id" | "name" | "leakProbability" | "level" | "lossRate" | "lostM3h" | "pressureDeviation"
    > & { lngLat: LngLat }
  >;
  selected: SectorLossDetail;
  action: {
    title: string;
    rationale: string;
    window: string;
    team: string;
    priority: Priority;
    decisionId: string;
  };
};

export type LeakReplayFrame = {
  /** Instante do quadro (ISO). */
  at: string;
  t: string;
  hoursFromOnset: number;
  probability: number;
  pressureDeviation: number;
  inflowExcess: number;
  level: Severity;
  note: string | null;
};

export type LeakReplayResponse = {
  sector: string;
  sizeLps: number;
  pipeId: string;
  onset: string;
  detectedAt: string | null;
  frames: LeakReplayFrame[];
  hypothetical: boolean;
};

// ---------------------------------------------------------------------------
// Seca e resiliência
// ---------------------------------------------------------------------------

export type DroughtParams = {
  pressureReduction: number;
  transfer: boolean;
  campaign: boolean;
  rain: "normal" | "abaixo" | "critica";
};

export type DroughtSystem = {
  id: string;
  name: string;
  sectors: string[];
  sectorNames: string[];
  level: number;
  trend7d: number;
  severity: Severity;
  daysToCritical: number | null;
  adverseDays: number | null;
  capacityM3: number;
  demandM3day: number;
  productionM3day: number;
  lossesM3day: number;
  /** (produção − consumo − perdas) / consumo, em %. */
  margin: number;
  wellsOffline: number;
  reservoirs: string[];
};

export type DroughtScenario = {
  id: string;
  name: string;
  detail: string;
  daysToCritical: number | null;
  gain: number | null;
};

export type DroughtPoint = {
  /** Dias relativos a hoje (negativo = histórico). */
  day: number;
  date: string;
  observed: number | null;
  base: number | null;
  adverse: number | null;
  scenario: number | null;
};

export type DroughtResponse = {
  generatedAt: string;
  weatherSource: Weather["source"];
  focus: string;
  climate: {
    rain60: number;
    normal60: number;
    tmax7: number;
    normalTmax: number;
    rainNext16: number;
    tmaxNext16: number;
  };
  city: {
    level: number;
    daysToCritical: number | null;
    criticalSystem: string;
    adverseDays: number | null;
    demandLps: number;
    productionLps: number;
  };
  systems: DroughtSystem[];
  series: DroughtPoint[];
  daily: Array<{
    day: number;
    date: string;
    demand: number;
    production: number;
    losses: number;
    tmax: number;
    rain: number;
    observed: boolean;
  }>;
  scenarios: DroughtScenario[];
  selectedScenario: string;
  custom: {
    daysToCritical: number | null;
    baseline: number | null;
    gain: number | null;
    breakdown: Array<{ label: string; days: number }>;
  } | null;
  criticalLevel: number;
  horizonDays: number;
};

// ---------------------------------------------------------------------------
// Enchentes
// ---------------------------------------------------------------------------

export type FloodHotspot = {
  id: string;
  name: string;
  stream: string;
  sector: string | null;
  lngLat: LngLat;
  level: Severity;
  peakRatio: number;
  minutesToCritical: number | null;
  peakMinutes: number | null;
  capacity: number;
  peakFlow: number;
  tcMinutes: number;
  catchmentKm2: number;
  gallery: string;
  facilities: Array<{ id: string; name: string; kind: string; distance: number }>;
};

export type FloodFrame = {
  minute: number;
  rainAccum: number;
  intensity: number;
  maxRatio: number;
  level: Severity;
  hotspots: Record<string, number>;
};

export type FieldGrid = {
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  /** Valores 0–255 em base64 (linha a linha, norte → sul). */
  data: string;
};

export type FloodResponse = {
  generatedAt: string;
  mode: RainMode;
  weatherSource: Weather["source"];
  summary: {
    rain3h: number;
    rain24h: number;
    peakIntensity: number;
    level: Severity;
    pointsAtRisk: number;
    minutesToFirstCritical: number | null;
    headline: string;
  };
  forecast: Array<{ time: string; intensity: number; accumulated: number; origin: DataOrigin }>;
  hotspots: FloodHotspot[];
  rivers: Array<{
    sensorId: string;
    stream: string;
    alert: number;
    flood: number;
    series: Array<{ time: string; level: number | null; projected: number | null }>;
  }>;
  frames: FloodFrame[];
  risk: FieldGrid;
  /** Suscetibilidade do relevo (estática, independe da chuva). */
  susceptibility: FieldGrid;
};

// ---------------------------------------------------------------------------
// Active Sensing
// ---------------------------------------------------------------------------

export type SensingCandidate = {
  id: string;
  rank: number;
  lngLat: LngLat;
  sector: string | null;
  street: string | null;
  coverageGain: number;
  uncertaintyDrop: number;
  sectorsBenefited: string[];
  priority: Priority;
};

export type SensingResponse = {
  generatedAt: string;
  installed: number;
  before: { coverage: number; uncertainty: number; detection: number };
  after: { coverage: number; uncertainty: number; detection: number };
  current: { coverage: number; uncertainty: number; detection: number };
  sensors: number;
  bySector: Array<{
    id: string;
    name: string;
    uncertainty: number;
    coverage: number;
    sensors: number;
  }>;
  plan: SensingCandidate[];
  curve: Array<{ sensors: number; coverage: number; uncertainty: number }>;
  rationale: Array<{ title: string; detail: string; weight: number }>;
  coverageField: FieldGrid;
  uncertaintyField: FieldGrid;
  method: { lengthScale: number; noise: number; threshold: number };
};

// ---------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------

export type DecisionsResponse = {
  generatedAt: string;
  decisions: Decision[];
  workOrders: WorkOrder[];
  summary: { pending: number; running: number; simulated: number; averageConfidence: number };
};
