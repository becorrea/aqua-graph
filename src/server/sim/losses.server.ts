/**
 * Detecção de vazamentos não visíveis.
 *
 * Combina quatro evidências independentes, como numa central de controle
 * de perdas:
 * 1. vazão mínima noturna (MNF) — entre 02h e 04h o consumo legítimo é
 *    mínimo; excesso persistente em relação ao histórico é perda física;
 * 2. resíduo de pressão — leitura abaixo do que o modelo hidráulico espera;
 * 3. balanço vazão × consumo micromedido — água que entra e não é consumida;
 * 4. consumo medido — se o consumo também subiu, a vazão extra é explicada
 *    e a probabilidade cai (evita alarme falso em dias quentes).
 * Um prior de idade da rede e histórico de reparos completa o escore, que
 * vira probabilidade por uma logística calibrada.
 */
import type {
  LeakEvidence,
  LeakReplayFrame,
  LeakReplayResponse,
  LossesResponse,
  PipeCandidate,
  SectorLossDetail,
} from "@/types/api";
import type { Severity } from "@/types";
import {
  distance,
  model,
  pipesBySector,
  sectorById,
  toLngLat,
  type ModelSensor,
} from "../geo/model.server";
import {
  HOUR,
  MINUTE,
  clamp,
  formatClock,
  formatDay,
  formatRelative,
  local,
  localAt,
  memo,
  round,
  sigmoid,
} from "./core.server";
import {
  expectedConsumption,
  expectedInflow,
  expectedPressure,
  hypotheticalLeak,
  LOCAL_DROP,
  LOCAL_DROP_RANGE,
  measuredConsumption,
  measuredInflow,
  measuredPressure,
  params,
  scenarioEvents,
  sectorState,
  type HydraulicEvent,
} from "./hydraulics.server";

const pressureSensors = (sectorId: string) =>
  model.sensors.filter((sensor) => sensor.type === "pressure" && sensor.sector === sectorId);

export function levelFromProbability(probability: number): Severity {
  if (probability >= 80) return "critical";
  if (probability >= 60) return "high";
  if (probability >= 35) return "attention";
  return "normal";
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const sd = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

/** Mínimo de vazão na janela 02:00–04:15 de uma madrugada (amostras de 15 min). */
function nightMinimum(sectorId: string, nightStart: number, events: readonly HydraulicEvent[]) {
  let observed = Infinity;
  let expected = Infinity;
  for (let k = 0; k <= 9; k += 1) {
    const t = nightStart + k * 15 * MINUTE;
    observed = Math.min(observed, measuredInflow(sectorId, t, events));
    expected = Math.min(expected, expectedInflow(sectorId, t));
  }
  return { observed, expected };
}

/** Início (02:00) da última madrugada já encerrada em relação a `t`. */
function lastNight(t: number) {
  const tl = local(t);
  const minutes = tl.hour * 60 + tl.minute;
  return localAt(t, minutes >= 4 * 60 + 30 ? 0 : -1, 2, 0);
}

export type Detection = {
  probability: number;
  level: Severity;
  mnf: number;
  expectedMnf: number;
  mnfExcess: number;
  mnfZ: number;
  pressureDeviation: number;
  worstSensor: ModelSensor | null;
  pressureZ: number;
  inflowExcess: number;
  consumptionDeviation: number;
  balanceZ: number;
  prior: number;
  contributions: {
    mnf: number;
    pressure: number;
    balance: number;
    consumption: number;
    history: number;
  };
  nights: Array<{ date: string; mnf: number; expected: number }>;
};

/** Executa a detecção para um setor no instante `t`. */
export function detect(sectorId: string, t: number, events: readonly HydraulicEvent[]): Detection {
  const p = params(sectorId);

  // 1. Vazão mínima noturna: última noite vs. 13 anteriores.
  const last = lastNight(t);
  const nights: Detection["nights"] = [];
  const residuals: number[] = [];
  for (let n = 13; n >= 0; n -= 1) {
    const start = last - n * 24 * HOUR;
    const { observed, expected } = nightMinimum(sectorId, start, events);
    nights.push({ date: formatDay(start), mnf: round(observed, 1), expected: round(expected, 1) });
    residuals.push((observed - expected) / expected);
  }
  const lastResidual = residuals[residuals.length - 1] ?? 0;
  const history = residuals.slice(0, -1);
  const mnfZ = (lastResidual - mean(history)) / Math.max(sd(history), 0.012);
  const lastNightValues = nights[nights.length - 1] ?? { mnf: 0, expected: 0 };

  // 2. Resíduo de pressão nas últimas 6 h (a cada 20 min).
  let pressureDeviation = 0;
  let worstSensor: ModelSensor | null = null;
  for (const sensor of pressureSensors(sectorId)) {
    const deviations: number[] = [];
    for (let k = 0; k < 18; k += 1) {
      const time = t - k * 20 * MINUTE;
      const expected = expectedPressure(sensor, time);
      deviations.push((measuredPressure(sensor, time, events) - expected) / expected);
    }
    const value = mean(deviations);
    if (worstSensor === null || value < pressureDeviation) {
      pressureDeviation = value;
      worstSensor = sensor;
    }
  }
  const pressureZ = -pressureDeviation / 0.012;

  // 3 e 4. Balanço das últimas 24 h (a cada 30 min).
  let inflowObs = 0;
  let inflowExp = 0;
  let consObs = 0;
  let consExp = 0;
  for (let k = 0; k < 48; k += 1) {
    const time = t - k * 30 * MINUTE;
    inflowObs += measuredInflow(sectorId, time, events);
    inflowExp += expectedInflow(sectorId, time);
    consObs += measuredConsumption(sectorId, time, events);
    consExp += expectedConsumption(sectorId, time);
  }
  const inflowExcess = (inflowObs - inflowExp) / inflowExp;
  const consumptionDeviation = (consObs - consExp) / consExp;
  const demandShare = consExp / inflowExp;
  const unexplained = inflowExcess - consumptionDeviation * demandShare;
  const balanceZ = unexplained / 0.014;

  // Prior: idade média da rede e reparos recentes.
  const prior = clamp((p.meanPipeAge - 30) / 20, -0.5, 0.6) + (p.incidents12m - 2) * 0.12;

  const c = (z: number) => clamp(z, -2, 5);
  const contributions = {
    mnf: 0.36 * c(mnfZ),
    pressure: 0.26 * c(pressureZ),
    balance: 0.3 * c(balanceZ),
    consumption: -Math.max(0, consumptionDeviation) * 9,
    history: prior,
  };
  const score =
    contributions.mnf +
    contributions.pressure +
    contributions.balance +
    contributions.consumption +
    contributions.history;
  // Teto de 92%: o modelo nunca afirma certeza absoluta.
  const probability = Math.round(92 * sigmoid(1.15 * (score - 2.7)));

  return {
    probability,
    level: levelFromProbability(probability),
    mnf: lastNightValues.mnf,
    expectedMnf: lastNightValues.expected,
    mnfExcess: lastResidual,
    mnfZ,
    pressureDeviation,
    worstSensor,
    pressureZ,
    inflowExcess,
    consumptionDeviation,
    balanceZ,
    prior,
    contributions,
    nights,
  };
}

// ---------------------------------------------------------------------------
// Localização: qual trecho explica melhor o padrão de queda de pressão?
// ---------------------------------------------------------------------------

const MATERIAL_RISK: Record<string, number> = {
  "Cimento-amianto": 1.5,
  "Ferro fundido": 1.3,
  "PVC PBA": 1,
  "Ferro fundido dúctil": 0.8,
  PEAD: 0.6,
};

/**
 * A queda de pressão observada tem duas partes: uma global (entra mais água
 * no setor, a perda de carga aumenta — mais forte longe da entrada) e uma
 * local, que decai com a distância ao vazamento e cuja amplitude depende da
 * vazão perdida. Para cada trecho candidato, prevê a parte local, ajusta a
 * global por mínimos quadrados e transforma o erro em verossimilhança,
 * ponderada pelo risco a priori do tubo (idade, material, extensão).
 *
 * Usa a média das últimas 24 h, a cada 5 min. O ruído dos manômetros varia
 * devagar (ciclos de ~1 h): com só 6 h de dados ele mudava o primeiro do
 * ranking ao longo do dia, entre trechos à mesma distância do sensor.
 */
const WINDOW_SAMPLES = 288;
const WINDOW_STEP = 5 * MINUTE;
/** Erro aceito no ajuste (mca): menor que isso, o prior não desempata sozinho. */
const FIT_SIGMA = 0.045;

export function locate(
  sectorId: string,
  t: number,
  events: readonly HydraulicEvent[],
  limit = 3,
): PipeCandidate[] {
  const sensors = pressureSensors(sectorId);
  const sector = sectorById.get(sectorId);
  if (!sector || sensors.length === 0) return [];
  // Vazão perdida: vazão acima do esperado que o consumo medido não explica.
  let leakFlow = 0;
  for (let k = 0; k < WINDOW_SAMPLES; k += 1) {
    const time = t - k * WINDOW_STEP;
    leakFlow +=
      measuredInflow(sectorId, time, events) -
      expectedInflow(sectorId, time) -
      (measuredConsumption(sectorId, time, events) - expectedConsumption(sectorId, time));
  }
  leakFlow = Math.max(0, leakFlow / WINDOW_SAMPLES);
  const observed = sensors.map((sensor) => {
    let drop = 0;
    for (let k = 0; k < WINDOW_SAMPLES; k += 1) {
      const time = t - k * WINDOW_STEP;
      drop += expectedPressure(sensor, time) - measuredPressure(sensor, time, events);
    }
    return Math.max(0, drop / WINDOW_SAMPLES);
  });
  const globalShape = sensors.map(
    (sensor) => 0.35 + 0.65 * clamp(distance(sensor.xy, sector.inlet) / 2500, 0, 1),
  );
  const year = local(t).year;
  const pipes = pipesBySector.get(sectorId) ?? [];
  const scored = pipes.map((pipe) => {
    // A amplitude da queda local é conhecida: vem da vazão do vazamento estimada
    // pelo excesso de vazão das últimas 24 h. Só a componente global é ajustada.
    const local = sensors.map(
      (sensor) =>
        LOCAL_DROP * leakFlow * Math.exp(-distance(sensor.xy, pipe.mid) / LOCAL_DROP_RANGE),
    );
    const rest = observed.map((value, i) => value - (local[i] ?? 0));
    const hh = globalShape.reduce((sum, value) => sum + value * value, 0) || 1;
    const beta = Math.max(
      0,
      globalShape.reduce((sum, value, i) => sum + value * (rest[i] ?? 0), 0) / hh,
    );
    const sse = rest.reduce(
      (sum, value, i) => sum + (value - beta * (globalShape[i] ?? 0)) ** 2,
      0,
    );
    const likelihood = Math.exp(-sse / (2 * FIT_SIGMA ** 2));
    const prior =
      ((year - pipe.year) / 40) *
      (MATERIAL_RISK[pipe.material] ?? 1) *
      Math.sqrt(pipe.lengthM / 150);
    // Com um único sensor não há como separar as componentes: só o prior decide.
    return { pipe, weight: likelihood * prior };
  });
  const total = scored.reduce((sum, item) => sum + item.weight, 0) || 1;
  return scored
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ pipe, weight }) => ({
      id: pipe.id,
      street: pipe.street,
      diameter: pipe.diameter,
      material: pipe.material,
      year: pipe.year,
      lengthM: pipe.lengthM,
      share: Math.round((weight / total) * 100),
      lngLat: toLngLat(pipe.mid),
    }));
}

// ---------------------------------------------------------------------------
// Respostas da API
// ---------------------------------------------------------------------------

const pct = (value: number, digits = 1) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

function evidenceFor(d: Detection, sectorId: string): LeakEvidence[] {
  const total =
    Math.abs(d.contributions.mnf) +
      Math.abs(d.contributions.pressure) +
      Math.abs(d.contributions.balance) +
      Math.abs(d.contributions.consumption) +
      Math.abs(d.contributions.history) || 1;
  const w = (value: number) => Math.round((Math.abs(value) / total) * 100);
  const p = params(sectorId);
  const level = (z: number): Severity =>
    z >= 4 ? "critical" : z >= 2.5 ? "high" : z >= 1.5 ? "attention" : "normal";
  return [
    {
      id: "mnf",
      label: "Vazão mínima noturna",
      reading: `${pct(d.mnfExcess)} vs. esperado`,
      detail: `Madrugada: ${d.mnf.toLocaleString("pt-BR")} L/s medidos para ${d.expectedMnf.toLocaleString("pt-BR")} L/s esperados. Entre 02h e 04h quase ninguém consome — o excesso tende a ser perda física.`,
      weight: w(d.contributions.mnf),
      level: level(d.mnfZ),
    },
    {
      id: "pressure",
      label: "Queda de pressão",
      reading: `${pct(d.pressureDeviation)} no ${d.worstSensor?.id ?? "—"}`,
      detail:
        "Média das últimas 6 h comparada à pressão que o modelo hidráulico calcula para a mesma demanda.",
      weight: w(d.contributions.pressure),
      level: level(d.pressureZ),
    },
    {
      id: "balance",
      label: "Vazão sem consumo correspondente",
      reading: `${pct(d.inflowExcess)} de vazão nas últimas 24 h`,
      detail: "Água que entrou no setor pelo macromedidor e não apareceu no consumo micromedido.",
      weight: w(d.contributions.balance),
      level: level(d.balanceZ),
    },
    {
      id: "consumption",
      label: "Consumo micromedido",
      reading:
        Math.abs(d.consumptionDeviation) < 0.02
          ? "≈ normal"
          : `${pct(d.consumptionDeviation)} vs. padrão`,
      detail:
        d.consumptionDeviation > 0.03
          ? "O consumo também subiu: parte da vazão extra é uso legítimo (calor, irrigação), o que reduz a probabilidade."
          : "Consumo dentro do padrão: o aumento de vazão não é explicado por uso legítimo.",
      weight: w(d.contributions.consumption),
      level: d.consumptionDeviation > 0.03 ? "info" : "normal",
    },
    {
      id: "history",
      label: "Histórico da rede",
      reading: `${p.meanPipeAge} anos · ${p.incidents12m} reparos/12 meses`,
      detail:
        "Idade média ponderada dos tubos e ocorrências recentes elevam ou reduzem a chance a priori.",
      weight: w(d.contributions.history),
      level: d.prior > 0.25 ? "attention" : "normal",
    },
  ];
}

function conclusionFor(d: Detection) {
  if (d.probability >= 80)
    return "Os dados combinados indicam padrão consistente com perda física na rede. Recomenda-se inspeção em campo com geofone nos trechos destacados.";
  if (d.probability >= 60)
    return "Há indícios de perda física, mas a evidência ainda é parcial. Vale uma pesquisa acústica programada antes que o volume perdido cresça.";
  if (d.probability >= 35)
    return "Sinais fracos e ainda inconclusivos. O modelo segue acompanhando a próxima madrugada para confirmar ou descartar.";
  if (d.consumptionDeviation > 0.03)
    return "A vazão subiu, mas o consumo medido subiu junto: o comportamento é explicado por uso legítimo, não por vazamento.";
  return "Comportamento hidráulico dentro do esperado para o horário e o dia da semana.";
}

const dayEvents = memo<HydraulicEvent[]>(60_000);
export const eventsAt = (now: number) =>
  dayEvents(String(Math.floor(now / (10 * MINUTE))), () => scenarioEvents(now));

const lossesCache = memo<LossesResponse>(55_000);

export function getLosses(selectedId: string | null, now = Date.now()): LossesResponse {
  const minuteKey = Math.floor(now / MINUTE);
  return lossesCache(`${minuteKey}:${selectedId ?? ""}`, () => buildLosses(selectedId, now));
}

/** Parte da resposta que não depende do setor selecionado. */
type CityLosses = {
  events: HydraulicEvent[];
  detections: Map<string, Detection>;
  sectors: LossesResponse["sectors"];
  city: LossesResponse["city"];
};

const cityCache = memo<CityLosses>(55_000);
const leadCache = memo<number | null>(24 * HOUR);

/** Cidade inteira: recalculada uma vez por minuto, para qualquer setor clicado. */
function cityLosses(now: number): CityLosses {
  return cityCache(String(Math.floor(now / MINUTE)), () => buildCity(now));
}

function buildCity(now: number): CityLosses {
  const events = eventsAt(now);
  const detections = new Map(
    model.sectors.map((sector) => [sector.id, detect(sector.id, now, events)]),
  );

  let inflowDay = 0;
  let consumptionDay = 0;
  // Perda física de cada setor pelo balanço das últimas 24 h (como a da
  // cidade): a razão instantânea passa de 50% toda madrugada, quando o
  // consumo cai e o vazamento continua.
  const dailyLoss = new Map<string, number>();
  for (const sector of model.sectors) {
    let inflow = 0;
    let consumption = 0;
    for (let k = 0; k < 48; k += 1) {
      const time = now - k * 30 * MINUTE;
      inflow += measuredInflow(sector.id, time, events);
      consumption += measuredConsumption(sector.id, time, events);
    }
    inflowDay += inflow * 1.8;
    consumptionDay += consumption * 1.8;
    dailyLoss.set(sector.id, round((1 - consumption / inflow) * 100, 1));
  }
  const lostNow = model.sectors.reduce((sum, sector) => {
    const state = sectorState(sector.id, now, events);
    return sum + (state.background + state.leaks) * 3.6;
  }, 0);

  const sectors = model.sectors.map((sector) => {
    const d = detections.get(sector.id) as Detection;
    const state = sectorState(sector.id, now, events);
    return {
      id: sector.id,
      name: sector.name,
      leakProbability: d.probability,
      level: d.level,
      lossRate: dailyLoss.get(sector.id) ?? 0,
      lostM3h: round((state.background + state.leaks) * 3.6, 1),
      pressureDeviation: round(d.pressureDeviation * 100, 1),
      lngLat: toLngLat(sector.centroid),
    };
  });
  sectors.sort((a, b) => b.leakProbability - a.leakProbability);

  // O tempo até a detecção só muda quando muda o início do evento (1×/dia):
  // varrer a detecção hora a hora a cada minuto custava ~70% da resposta.
  const main = events.find((event) => event.id === "EV-14B");
  const mainDetection = main
    ? leadCache(String(main.onset), () => firstDetection(main, events, now))
    : null;

  return {
    events,
    detections,
    sectors,
    city: {
      lossRate: round((1 - consumptionDay / inflowDay) * 100, 1),
      lostM3h: Math.round(lostNow),
      inflowM3day: Math.round(inflowDay),
      consumptionM3day: Math.round(consumptionDay),
      alertSectors: sectors.filter((s) => s.leakProbability >= 35).length,
      detectionLeadHours:
        mainDetection && main ? Math.round((mainDetection - main.onset) / HOUR) : 0,
    },
  };
}

function buildLosses(selectedId: string | null, now: number): LossesResponse {
  const { events, detections, sectors, city } = cityLosses(now);
  const fallbackId = sectors[0]?.id ?? model.leak.sector;
  const sectorId = selectedId && sectorById.has(selectedId) ? selectedId : fallbackId;
  const selected = sectorDetail(sectorId, now, events, detections.get(sectorId) as Detection);

  return {
    generatedAt: new Date(now).toISOString(),
    city,
    sectors,
    selected,
    action: {
      title: selected.candidates[0]
        ? `Inspecionar trecho ${selected.candidates[0].id} — ${selected.candidates[0].street ?? selected.name}`
        : `Pesquisa de vazamento no setor ${selected.id}`,
      rationale:
        selected.leakProbability >= 60
          ? `Probabilidade de vazamento de ${selected.leakProbability}% e perda estimada de ${round(Math.max(0, selected.inflow - selected.expectedInflow) * 3.6, 0)} m³/h acima do normal.`
          : "Sem anomalia relevante: manter monitoramento e a rotina de pesquisa acústica.",
      window:
        selected.leakProbability >= 80
          ? "Próximas 4 horas"
          : selected.leakProbability >= 60
            ? "Próximas 24 horas"
            : "Rotina semanal",
      team:
        selected.leakProbability >= 80
          ? "Equipe Campo 03 (geofone + correlacionador)"
          : "Equipe de pesquisa acústica",
      priority:
        selected.leakProbability >= 80
          ? "Crítica"
          : selected.leakProbability >= 60
            ? "Alta"
            : "Média",
      decisionId: `DEC-PERDAS-${selected.id}`,
    },
  };
}

function sectorDetail(
  sectorId: string,
  now: number,
  events: readonly HydraulicEvent[],
  d: Detection,
): SectorLossDetail {
  const sector = sectorById.get(sectorId);
  if (!sector) throw new Error(`Setor desconhecido: ${sectorId}`);
  const state = sectorState(sectorId, now, events);
  const sensors = pressureSensors(sectorId);
  const reference = d.worstSensor ?? sensors[0] ?? null;
  const day: SectorLossDetail["day"] = [];
  let inflowDay = 0;
  let consumptionDay = 0;
  for (let k = 47; k >= 0; k -= 1) {
    const time = now - k * 30 * MINUTE;
    const inflow = measuredInflow(sectorId, time, events);
    const consumption = measuredConsumption(sectorId, time, events);
    inflowDay += inflow;
    consumptionDay += consumption;
    day.push({
      time: formatClock(time),
      inflow: round(inflow, 1),
      expected: round(expectedInflow(sectorId, time), 1),
      consumption: round(consumption, 1),
      pressure: reference ? round(measuredPressure(reference, time, events), 1) : 0,
      expectedPressure: reference ? round(expectedPressure(reference, time), 1) : 0,
    });
  }
  const leak = events.find(
    (event) => event.sector === sectorId && event.kind === "leak" && event.onset < now,
  );
  const candidates = d.probability >= 35 ? locate(sectorId, now, events) : [];
  return {
    id: sector.id,
    name: sector.name,
    neighborhoods: sector.neighborhoods,
    population: sector.population,
    connections: sector.connections,
    networkKm: round(sector.networkKm.main + sector.networkKm.sec, 0),
    leakProbability: d.probability,
    level: d.level,
    lossRate: round((1 - consumptionDay / inflowDay) * 100, 1),
    lostM3h: round((state.background + state.leaks) * 3.6, 1),
    inflow: round(measuredInflow(sectorId, now, events), 1),
    expectedInflow: round(expectedInflow(sectorId, now), 1),
    consumption: round(measuredConsumption(sectorId, now, events), 1),
    pressureDeviation: round(d.pressureDeviation * 100, 1),
    mnf: d.mnf,
    expectedMnf: d.expectedMnf,
    onset: leak && d.probability >= 35 ? formatRelative(leak.onset, now) : null,
    evidence: evidenceFor(d, sectorId),
    conclusion: conclusionFor(d),
    candidates,
    sensors: [
      ...model.sensors.filter((s) => s.type === "flow" && s.sector === sectorId).map((s) => s.id),
      ...sensors.map((s) => s.id),
    ],
    day,
    nights: d.nights,
  };
}

/** Primeiro instante (em passos de 1 h) em que o evento passou de 80%. */
function firstDetection(event: HydraulicEvent, events: readonly HydraulicEvent[], until: number) {
  for (let t = event.onset; t <= until; t += HOUR) {
    if (detect(event.sector, t, events).probability >= 80) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Replay / simulação de vazamento
// ---------------------------------------------------------------------------

const replayCache = memo<LeakReplayResponse>(5 * 60_000);

export function getLeakReplay(
  sectorId: string | null,
  sizeLps: number | null,
  now = Date.now(),
): LeakReplayResponse {
  const hypothetical = Boolean(sectorId && sectorId !== model.leak.sector) || sizeLps !== null;
  const key = `${Math.floor(now / (10 * MINUTE))}:${sectorId}:${sizeLps}`;
  return replayCache(key, () =>
    buildReplay(
      hypothetical ? (sectorId ?? model.leak.sector) : model.leak.sector,
      sizeLps,
      hypothetical,
      now,
    ),
  );
}

function buildReplay(
  sectorId: string,
  sizeLps: number | null,
  hypothetical: boolean,
  now: number,
): LeakReplayResponse {
  const base = eventsAt(now);
  let events: HydraulicEvent[];
  let event: HydraulicEvent;
  let start: number;
  let end: number;
  if (hypothetical) {
    // Simulação "e se": vazamento novo a partir de agora, 30 h à frente.
    const onset = Math.ceil(now / (10 * MINUTE)) * 10 * MINUTE;
    event = hypotheticalLeak(sectorId, sizeLps ?? 10, onset);
    events = [...base.filter((e) => e.sector !== sectorId || e.kind !== "leak"), event];
    start = onset - 2 * HOUR;
    end = onset + 30 * HOUR;
  } else {
    event = base.find((e) => e.id === "EV-14B") as HydraulicEvent;
    events = base;
    start = event.onset - 2 * HOUR;
    end = now;
  }
  const frames: LeakReplayFrame[] = [];
  let detectedAt: number | null = null;
  const step = Math.max(HOUR, Math.round((end - start) / 18 / HOUR) * HOUR);
  for (let t = start; t <= end + 1; t += step) {
    const d = detect(sectorId, t, events);
    if (detectedAt === null && d.probability >= 80) detectedAt = t;
    const hours = (t - event.onset) / HOUR;
    const tl = local(t);
    const note =
      hours < 0
        ? "Antes do evento: leituras dentro do padrão"
        : tl.hour >= 2 && tl.hour <= 5
          ? "Madrugada: consumo mínimo revela o excesso de vazão"
          : d.probability >= 80
            ? "Evidências combinadas confirmam o padrão de perda física"
            : d.pressureZ > 2
              ? "Pressão começa a desviar do modelo hidráulico"
              : null;
    frames.push({
      at: new Date(t).toISOString(),
      t: formatRelative(t, now),
      hoursFromOnset: Math.round(hours),
      probability: d.probability,
      pressureDeviation: round(d.pressureDeviation * 100, 1),
      inflowExcess: round(d.inflowExcess * 100, 1),
      level: d.level,
      note,
    });
  }
  return {
    sector: sectorId,
    sizeLps: round(event.size, 1),
    pipeId: event.pipeId ?? "—",
    onset: formatRelative(event.onset, now),
    detectedAt: detectedAt ? formatRelative(detectedAt, now) : null,
    frames,
    hypothetical,
  };
}
