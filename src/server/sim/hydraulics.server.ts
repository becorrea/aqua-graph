/**
 * Modelo hidráulico simplificado por setor de abastecimento (DMA).
 *
 * Para cada instante calcula:
 * - consumo: população × consumo per capita × curva horária;
 * - vazamento de fundo: modelo FAVAD, L = L₀ · (P/30)^1,15 — perdas crescem
 *   com a pressão média da zona;
 * - vazamentos pontuais (eventos): vazão de orifício, ∝ √P;
 * - perda de carga: ∝ (vazão/vazão de pico)^1,85 (Hazen-Williams);
 * - pressão em cada sensor: carga do setor − cota real do terreno − perda
 *   de carga − queda local causada por vazamentos próximos.
 *
 * O "esperado" é o mesmo modelo sem os eventos — é com ele que a detecção
 * compara as leituras, exatamente como um modelo calibrado faria.
 */
import {
  distance,
  model,
  pipesBySector,
  sectorById,
  type ModelSector,
  type ModelSensor,
  type XY,
} from "../geo/model.server";
import {
  HOUR,
  PEAK_DEMAND_FACTOR,
  clamp,
  demandFactor,
  local,
  localAt,
  sensorNoise,
  white,
} from "./core.server";

export type SectorParams = {
  id: string;
  perCapita: number;
  demandAvg: number;
  leakRef: number;
  head: number;
  meanStatic: number;
  headlossPeak: number;
  peakFlow: number;
  meanPipeAge: number;
  incidents12m: number;
};

const unit = (key: string) => (white(key, 0) + 1) / 2;

/** Queda local de pressão por L/s de vazamento (mca), decaindo com a distância. */
export const LOCAL_DROP = 0.24;
export const LOCAL_DROP_RANGE = 650;

function buildParams(sector: ModelSector): SectorParams {
  const r = (k: string) => unit(`sector:${sector.id}:${k}`);
  const perCapita = sector.name === "Centro" ? 176 : Math.round(188 + r("pc") * 42);
  const demandAvg = (sector.population * perCapita) / 86_400;
  const pipes = pipesBySector.get(sector.id) ?? [];
  const totalLength = pipes.reduce((sum, pipe) => sum + pipe.lengthM, 0) || 1;
  const meanYear = pipes.reduce((sum, pipe) => sum + pipe.year * pipe.lengthM, 0) / totalLength;
  const meanPipeAge = Math.round(local(Date.now()).year - meanYear);
  // Redes mais antigas vazam mais por ligação.
  const leakPerConnection = 145 + clamp((meanPipeAge - 25) / 25, 0, 1) * 80 + r("leak") * 45;
  const leakRef = (sector.connections * leakPerConnection) / 86_400;
  const head = sector.elevation.max + 30;
  const meanStatic = Math.min(head - sector.elevation.mean, 46);
  return {
    id: sector.id,
    perCapita,
    demandAvg,
    leakRef,
    head,
    meanStatic,
    headlossPeak: 6 + r("hl") * 5,
    peakFlow: demandAvg * PEAK_DEMAND_FACTOR + leakRef,
    meanPipeAge,
    incidents12m: Math.round(1 + r("inc") * 3 + (meanPipeAge > 38 ? 1 : 0)),
  };
}

export const sectorParams = new Map(
  model.sectors.map((sector) => [sector.id, buildParams(sector)]),
);

export function params(sectorId: string): SectorParams {
  const value = sectorParams.get(sectorId);
  if (!value) throw new Error(`Setor desconhecido: ${sectorId}`);
  return value;
}

// ---------------------------------------------------------------------------
// Eventos do cenário de demonstração
// ---------------------------------------------------------------------------

export type HydraulicEvent = {
  id: string;
  sector: string;
  kind: "leak" | "demand";
  xy: XY;
  pipeId: string | null;
  /** L/s para vazamentos; fração de aumento para consumo. */
  size: number;
  onset: number;
  rampHours: number;
  hypothetical?: boolean;
};

/** Trecho antigo mais próximo de um ponto — onde um vazamento "nasce". */
function oldPipeNear(sectorId: string, xy: XY, salt: string) {
  const pipes = (pipesBySector.get(sectorId) ?? []).filter((pipe) => pipe.cls === "sec");
  const scored = pipes
    .map((pipe) => ({
      pipe,
      score:
        distance(pipe.mid, xy) * (pipe.year < 1985 ? 0.6 : 1.4) + unit(`${salt}:${pipe.id}`) * 220,
    }))
    .sort((a, b) => a.score - b.score);
  return scored[0]?.pipe ?? null;
}

const offset = (sector: ModelSector, dx: number, dy: number): XY => [
  sector.centroid[0] + dx,
  sector.centroid[1] + dy,
];

/**
 * Eventos ativos. O vazamento principal começa às 03:10 do dia anterior
 * (ou de dois dias atrás, se ainda for madrugada): assim sempre existe ao
 * menos uma madrugada completa de evidência, como na operação real.
 */
export function scenarioEvents(now: number): HydraulicEvent[] {
  const hour = local(now).hour;
  const centro = sectorById.get("08-C");
  const iraja = sectorById.get("21-D");
  const tiberio = sectorById.get("33-G");
  const events: HydraulicEvent[] = [
    {
      id: "EV-14B",
      sector: model.leak.sector,
      kind: "leak",
      xy: model.leak.xy,
      pipeId: model.leak.pipeId,
      size: 11.5,
      onset: localAt(now, hour >= 5 ? -1 : -2, 3, 10),
      rampHours: 7,
    },
  ];
  if (centro) {
    const pipe = oldPipeNear(centro.id, offset(centro, 420, -260), "ev08");
    events.push({
      id: "EV-08C",
      sector: centro.id,
      kind: "leak",
      xy: pipe?.mid ?? centro.centroid,
      pipeId: pipe?.id ?? null,
      size: 7.2,
      onset: localAt(now, -4, 23, 40),
      rampHours: 30,
    });
  }
  if (iraja) {
    const pipe = oldPipeNear(iraja.id, offset(iraja, -300, 380), "ev21");
    events.push({
      id: "EV-21D",
      sector: iraja.id,
      kind: "leak",
      xy: pipe?.mid ?? iraja.centroid,
      pipeId: pipe?.id ?? null,
      size: 5.2,
      onset: localAt(now, -6, 4, 20),
      rampHours: 48,
    });
  }
  if (tiberio) {
    // Consumo legítimo mais alto (calor + irrigação de áreas verdes): a vazão
    // sobe, mas o consumo medido acompanha — o modelo não deve acusar vazamento.
    events.push({
      id: "EV-33G",
      sector: tiberio.id,
      kind: "demand",
      xy: tiberio.centroid,
      pipeId: null,
      size: 0.085,
      onset: localAt(now, -2, 8, 0),
      rampHours: 5,
    });
  }
  return events;
}

/** Cria um vazamento hipotético para o simulador "e se". */
export function hypotheticalLeak(sectorId: string, sizeLps: number, onset: number): HydraulicEvent {
  const sector = sectorById.get(sectorId);
  if (!sector) throw new Error(`Setor desconhecido: ${sectorId}`);
  const pipe = oldPipeNear(sectorId, offset(sector, 180, 140), `hyp:${sectorId}`);
  return {
    id: `EV-HYP-${sectorId}`,
    sector: sectorId,
    kind: "leak",
    xy: pipe?.mid ?? sector.centroid,
    pipeId: pipe?.id ?? null,
    size: sizeLps,
    onset,
    rampHours: 3,
    hypothetical: true,
  };
}

const ramp = (event: HydraulicEvent, t: number) =>
  t < event.onset ? 0 : clamp((t - event.onset) / (event.rampHours * HOUR), 0, 1);

// ---------------------------------------------------------------------------
// Estado de um setor num instante
// ---------------------------------------------------------------------------

export type SectorState = {
  demand: number;
  background: number;
  leaks: number;
  inflow: number;
  azp: number;
  headloss: number;
};

export function sectorState(
  sectorId: string,
  t: number,
  events: readonly HydraulicEvent[] = [],
): SectorState {
  const p = params(sectorId);
  const lt = local(t);
  let demand = p.demandAvg * demandFactor(t, lt);
  const hour = lt.hour;
  const own = events.filter((event) => event.sector === sectorId);
  for (const event of own) {
    if (event.kind !== "demand") continue;
    const daytime = hour >= 7 && hour <= 19 ? 1 : 0.18;
    demand *= 1 + event.size * ramp(event, t) * daytime;
  }
  let inflow = demand + p.leakRef;
  let azp = p.meanStatic;
  let headloss = 0;
  let background = p.leakRef;
  let leaks = 0;
  for (let i = 0; i < 3; i += 1) {
    headloss = p.headlossPeak * (inflow / p.peakFlow) ** 1.85;
    azp = Math.max(8, p.meanStatic - 0.55 * headloss);
    background = p.leakRef * (azp / 30) ** 1.15;
    leaks = own
      .filter((event) => event.kind === "leak")
      .reduce((sum, event) => sum + event.size * ramp(event, t) * Math.sqrt(azp / 30), 0);
    inflow = demand + background + leaks;
  }
  return { demand, background, leaks, inflow, azp, headloss };
}

/** Pressão estática no ponto, com válvula redutora nas cotas mais baixas. */
function staticPressure(p: SectorParams, z: number) {
  const raw = p.head - z;
  return raw > 48 ? 44 + (raw - 48) * 0.08 : raw;
}

export function sensorPressure(sensor: ModelSensor, t: number, events: readonly HydraulicEvent[]) {
  const sectorId = sensor.sector ?? "";
  const p = params(sectorId);
  const sector = sectorById.get(sectorId);
  const state = sectorState(sectorId, t, events);
  const inletDistance = sector ? distance(sensor.xy, sector.inlet) : 1500;
  const factor = 0.35 + 0.65 * clamp(inletDistance / 2500, 0, 1);
  let pressure = staticPressure(p, sensor.z) - state.headloss * factor;
  for (const event of events) {
    if (event.kind !== "leak" || event.sector !== sectorId) continue;
    // Mesma vazão de orifício que entra no balanço do setor (∝ √P).
    const flow = event.size * ramp(event, t) * Math.sqrt(state.azp / 30);
    pressure -= LOCAL_DROP * flow * Math.exp(-distance(sensor.xy, event.xy) / LOCAL_DROP_RANGE);
  }
  return Math.max(2, pressure);
}

// ---------------------------------------------------------------------------
// Leituras "medidas" (modelo + ruído de instrumento)
// ---------------------------------------------------------------------------

export function measuredInflow(sectorId: string, t: number, events: readonly HydraulicEvent[]) {
  return sectorState(sectorId, t, events).inflow * (1 + 0.011 * sensorNoise(`VZ:${sectorId}`, t));
}

export function expectedInflow(sectorId: string, t: number) {
  return sectorState(sectorId, t).inflow;
}

/** Consumo micromedido (telemetria de hidrômetros) — atraso desprezado. */
export function measuredConsumption(
  sectorId: string,
  t: number,
  events: readonly HydraulicEvent[],
) {
  return sectorState(sectorId, t, events).demand * (1 + 0.014 * sensorNoise(`CM:${sectorId}`, t));
}

export function expectedConsumption(sectorId: string, t: number) {
  return params(sectorId).demandAvg * demandFactor(t);
}

export function measuredPressure(
  sensor: ModelSensor,
  t: number,
  events: readonly HydraulicEvent[],
) {
  return sensorPressure(sensor, t, events) + 0.22 * sensorNoise(`PS:${sensor.id}`, t);
}

export function expectedPressure(sensor: ModelSensor, t: number) {
  return sensorPressure(sensor, t, []);
}
