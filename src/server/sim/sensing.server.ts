/**
 * Active Sensing: onde um novo sensor reduz mais a incerteza do modelo.
 *
 * O estado hidráulico (pressão/vazão) da rede é tratado como um campo
 * aleatório gaussiano sobre ~7 mil pontos amostrados ao longo das tubulações
 * reais. Cada sensor de pressão ou vazão observa o campo no seu ponto.
 *
 * - Kernel: k(d) = exp(−d² / 2ℓ²), ℓ = 1,1 km (a pressão varia de forma suave
 *   numa rede malhada); ruído de medição τ² = 0,04.
 * - Incerteza num ponto = variância a posteriori v(x) = 1 − kₓᵀ(K + τ²I)⁻¹kₓ.
 * - Cobertura = fração (ponderada por importância do trecho) da rede com
 *   v(x) < 0,5 — onde o modelo "enxerga" mais do que adivinha.
 * - Ganho de um candidato c = Σ w · Δv, com Δv(x) = k(x,c|S)² / (v(c) + τ²).
 * A escolha é gulosa (melhor sensor, depois o melhor dado o primeiro...), o
 * que dá uma curva de retornos decrescentes — o argumento para expandir a
 * telemetria aos poucos, onde ela rende mais.
 */
import type { FieldGrid, SensingCandidate, SensingResponse } from "@/types/api";
import type { Priority } from "@/types";
import {
  distance,
  model,
  pointInPolygon,
  sectorAt,
  sectorById,
  toLngLat,
  toXY,
  type XY,
} from "../geo/model.server";
import { clamp, memo, round } from "./core.server";
import { params } from "./hydraulics.server";

const LENGTH = 1100;
const NOISE = 0.04;
const THRESHOLD = 0.5;
/** Além de 2,5ℓ o kernel vale < 4%: pontos mais distantes são ignorados no ganho. */
const CUTOFF = 2.5 * LENGTH;
const PLAN_SIZE = 3;
const CURVE_SIZE = 8;

const kernel = (d: number) => Math.exp(-(d * d) / (2 * LENGTH * LENGTH));

// Pontos da rede em vetores tipados: o cálculo abaixo roda milhões de vezes.
const points = model.sensing.points;
const P = points.length;
const px = Float64Array.from(points, (p) => p[0]);
const py = Float64Array.from(points, (p) => p[1]);
const weights = Float64Array.from(points, (p) => p[2]);
const pointSectorIndex = Int16Array.from(points, (p) => p[3]);
const totalWeight = weights.reduce((sum, w) => sum + w, 0);
const pointSector = Array.from(pointSectorIndex, (i) => model.sectors[i]?.id ?? null);

const baseSensors = model.sensors
  .filter((s) => s.type === "pressure" || s.type === "flow")
  .map((s) => s.xy);

/** Cholesky de K + τ²I (n ≤ ~30, barato), em matriz plana n × n. */
function cholesky(sensors: XY[]) {
  const n = sensors.length;
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = kernel(distance(sensors[i] as XY, sensors[j] as XY)) + (i === j ? NOISE : 0);
      for (let k = 0; k < j; k += 1) sum -= (L[i * n + k] ?? 0) * (L[j * n + k] ?? 0);
      L[i * n + j] = i === j ? Math.sqrt(Math.max(sum, 1e-9)) : sum / (L[j * n + j] ?? 1);
    }
  }
  return L;
}

/** z = L⁻¹ kₓ, escrito em `out` a partir de `offset`. */
function solveInto(
  L: Float64Array,
  sensors: XY[],
  x: number,
  y: number,
  out: Float64Array,
  offset: number,
) {
  const n = sensors.length;
  for (let i = 0; i < n; i += 1) {
    const s = sensors[i] as XY;
    let sum = kernel(Math.hypot(x - s[0], y - s[1]));
    for (let k = 0; k < i; k += 1) sum -= (L[i * n + k] ?? 0) * (out[offset + k] ?? 0);
    out[offset + i] = sum / (L[i * n + i] ?? 1);
  }
}

/** Posterior em todos os pontos: Z (P × n, uma linha por ponto) e variância. */
type Posterior = { n: number; z: Float64Array; variance: Float64Array };

function posterior(sensors: XY[]): Posterior {
  const n = sensors.length;
  const L = cholesky(sensors);
  const z = new Float64Array(P * n);
  const variance = new Float64Array(P);
  for (let i = 0; i < P; i += 1) {
    solveInto(L, sensors, px[i] ?? 0, py[i] ?? 0, z, i * n);
    let dot = 0;
    for (let k = 0; k < n; k += 1) dot += (z[i * n + k] ?? 0) ** 2;
    variance[i] = clamp(1 - dot, 0, 1);
  }
  return { n, z, variance };
}

function metrics(variance: Float64Array) {
  let covered = 0;
  let uncertainty = 0;
  let detection = 0;
  for (let i = 0; i < P; i += 1) {
    const w = weights[i] ?? 0;
    const v = variance[i] ?? 1;
    if (v < THRESHOLD) covered += w;
    uncertainty += w * v;
    detection += w * (1 - v);
  }
  return {
    coverage: round((covered / totalWeight) * 100, 1),
    uncertainty: round((uncertainty / totalWeight) * 100, 1),
    detection: round((detection / totalWeight) * 100, 1),
  };
}

/**
 * Vizinhança de cada candidato (pontos a menos de CUTOFF) com o kernel já
 * calculado — não muda entre as etapas da seleção gulosa.
 */
type Neighborhood = { index: Int32Array; k: Float64Array };
let neighborhoods: Neighborhood[] | null = null;

function candidateNeighborhoods(): Neighborhood[] {
  if (neighborhoods) return neighborhoods;
  neighborhoods = model.sensing.candidates.map(({ xy: [cx, cy] }) => {
    const index: number[] = [];
    const k: number[] = [];
    for (let i = 0; i < P; i += 1) {
      const d = Math.hypot((px[i] ?? 0) - cx, (py[i] ?? 0) - cy);
      if (d > CUTOFF) continue;
      index.push(i);
      k.push(kernel(d));
    }
    return { index: Int32Array.from(index), k: Float64Array.from(k) };
  });
  return neighborhoods;
}

/**
 * Ganho de informação de um candidato: Σ w · Δv, com
 * Δv(x) = k(x,c|S)² / (v(c) + τ²) e k(x,c|S) = k(x,c) − zₓ·z_c.
 * Só soma — o vetor de variâncias não é copiado.
 */
function gainOf(
  post: Posterior,
  L: Float64Array,
  sensors: XY[],
  c: XY,
  hood: Neighborhood,
  zc: Float64Array,
) {
  const n = post.n;
  solveInto(L, sensors, c[0], c[1], zc, 0);
  let vc = 1;
  for (let k = 0; k < n; k += 1) vc -= (zc[k] ?? 0) ** 2;
  vc = Math.max(vc, 1e-6);
  let gain = 0;
  const { index, k: kc } = hood;
  for (let j = 0; j < index.length; j += 1) {
    const i = index[j] ?? 0;
    let cross = kc[j] ?? 0;
    const base = i * n;
    for (let k = 0; k < n; k += 1) cross -= (post.z[base + k] ?? 0) * (zc[k] ?? 0);
    gain += (weights[i] ?? 0) * ((cross * cross) / (vc + NOISE));
  }
  return { gain, localVariance: vc };
}

type Plan = {
  steps: Array<{
    xy: XY;
    sector: string | null;
    street: string | null;
    gain: number;
    localVariance: number;
    variance: Float64Array;
  }>;
  base: Posterior;
};

let planValue: Plan | null = null;

/**
 * Seleção gulosa dos próximos sensores. Depende só do modelo estático, então
 * é calculada uma vez por instância do servidor.
 */
function plan(): Plan {
  if (planValue) return planValue;
  const hoods = candidateNeighborhoods();
  const base = posterior(baseSensors);
  const steps: Plan["steps"] = [];
  let sensors = [...baseSensors];
  let current = base;
  const used = new Set<number>();
  for (let step = 0; step < CURVE_SIZE; step += 1) {
    const L = cholesky(sensors);
    const zc = new Float64Array(sensors.length);
    let best: { index: number; gain: number; localVariance: number } | null = null;
    model.sensing.candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      if (sensors.some((xy) => distance(xy, candidate.xy) < 500)) return;
      const hood = hoods[index];
      if (!hood) return;
      const result = gainOf(current, L, sensors, candidate.xy, hood, zc);
      if (!best || result.gain > best.gain) best = { index, ...result };
    });
    const chosen = best as { index: number; gain: number; localVariance: number } | null;
    const candidate = chosen ? model.sensing.candidates[chosen.index] : undefined;
    if (!chosen || !candidate) break;
    used.add(chosen.index);
    sensors = [...sensors, candidate.xy];
    current = posterior(sensors);
    steps.push({
      xy: candidate.xy,
      sector: candidate.sector,
      street: candidate.street,
      gain: chosen.gain,
      localVariance: chosen.localVariance,
      variance: current.variance,
    });
  }
  planValue = { steps, base };
  return planValue;
}

/** Grade de visualização: variância a posteriori nas células com rede próxima. */
function fieldGrids(sensors: XY[]): { uncertainty: FieldGrid; coverage: FieldGrid } {
  const { bbox } = model.floodGrid;
  const cols = 92;
  const rows = 82;
  const [west, south, east, north] = bbox;
  const L = cholesky(sensors);
  const z = new Float64Array(sensors.length);
  const unc: number[] = [];
  const cov: number[] = [];
  const mask = sectorMask(cols, rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const m = mask[r * cols + c] ?? 0;
      if (m === 0) {
        unc.push(0);
        cov.push(0);
        continue;
      }
      const xy = toXY([
        west + ((east - west) * (c + 0.5)) / cols,
        north - ((north - south) * (r + 0.5)) / rows,
      ]);
      solveInto(L, sensors, xy[0], xy[1], z, 0);
      let dot = 0;
      for (let k = 0; k < z.length; k += 1) dot += (z[k] ?? 0) ** 2;
      const v = clamp(1 - dot, 0, 1);
      unc.push(v * m);
      cov.push((1 - v) * m);
    }
  }
  return {
    uncertainty: { bbox, cols, rows, data: encode(unc) },
    coverage: { bbox, cols, rows, data: encode(cov) },
  };
}

const maskCache = new Map<string, number[]>();

/**
 * Máscara do campo: células dentro de algum setor de abastecimento. Usar o
 * recorte inteiro (e não só as células com tubulação) evita "buracos"
 * quadriculados no mapa — fora da rede a incerteza é apenas a do entorno.
 */
function sectorMask(cols: number, rows: number) {
  const key = `${cols}x${rows}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const [west, south, east, north] = model.floodGrid.bbox;
  const mask: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const xy = toXY([
        west + ((east - west) * (c + 0.5)) / cols,
        north - ((north - south) * (r + 0.5)) / rows,
      ]);
      mask.push(model.sectors.some((sector) => pointInPolygon(xy, sector.polygon)) ? 1 : 0);
    }
  }
  maskCache.set(key, mask);
  return mask;
}

function encode(values: number[]) {
  let binary = "";
  for (const v of values) binary += String.fromCharCode(clamp(Math.round(v * 255), 0, 255));
  return btoa(binary);
}

/** Incerteza, cobertura e número de sensores por setor (uma passada nos pontos). */
function bySector(variance: Float64Array, sensors: XY[]) {
  const S = model.sectors.length;
  const w = new Float64Array(S);
  const v = new Float64Array(S);
  const covered = new Float64Array(S);
  for (let i = 0; i < P; i += 1) {
    const s = pointSectorIndex[i] ?? -1;
    if (s < 0) continue;
    const weight = weights[i] ?? 0;
    const value = variance[i] ?? 1;
    w[s] = (w[s] ?? 0) + weight;
    v[s] = (v[s] ?? 0) + weight * value;
    if (value < THRESHOLD) covered[s] = (covered[s] ?? 0) + weight;
  }
  const counts = new Map<string, number>();
  for (const xy of sensors) {
    const id = sectorAt(xy);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return model.sectors.map((sector, s) => ({
    id: sector.id,
    name: sector.name,
    uncertainty: round(((v[s] ?? 0) / (w[s] || 1)) * 100, 1),
    coverage: round(((covered[s] ?? 0) / (w[s] || 1)) * 100, 1),
    sensors: counts.get(sector.id) ?? 0,
  }));
}

const responseCache = memo<SensingResponse>(24 * 60 * 60_000);

export function getSensing(installed: number): SensingResponse {
  const count = clamp(Math.round(installed), 0, PLAN_SIZE);
  return responseCache(`installed:${count}`, () => buildSensing(count));
}

function buildSensing(installed: number): SensingResponse {
  const { steps, base } = plan();
  const before = metrics(base.variance);
  const chosen = steps.slice(0, PLAN_SIZE);
  const afterVariance = chosen[chosen.length - 1]?.variance ?? base.variance;
  const after = metrics(afterVariance);
  const currentVariance =
    installed > 0 ? (steps[installed - 1]?.variance ?? base.variance) : base.variance;
  const current = metrics(currentVariance);
  const sensors = [...baseSensors, ...steps.slice(0, installed).map((s) => s.xy)];

  let previous = base.variance;
  const planList: SensingCandidate[] = chosen.map((step, index) => {
    const m0 = metrics(previous);
    const m1 = metrics(step.variance);
    const old = new Map(bySector(previous, []).map((sector) => [sector.id, sector.uncertainty]));
    const sectorDiff = bySector(step.variance, []).filter(
      (sector) => (old.get(sector.id) ?? sector.uncertainty) - sector.uncertainty >= 2,
    );
    previous = step.variance;
    const priority: Priority = index === 0 ? "Alta" : index === 1 ? "Alta" : "Média";
    return {
      id: `S-${27 + index}`,
      rank: index + 1,
      lngLat: toLngLat(step.xy),
      sector: step.sector,
      street: step.street,
      coverageGain: round(m1.coverage - m0.coverage, 1),
      uncertaintyDrop: round(m0.uncertainty - m1.uncertainty, 1),
      sectorsBenefited: sectorDiff.map((s) => s.id),
      priority,
    };
  });

  const curve = [
    { sensors: 0, ...metrics(base.variance) },
    ...steps.map((step, index) => ({ sensors: index + 1, ...metrics(step.variance) })),
  ].map((point) => ({
    sensors: point.sensors,
    coverage: point.coverage,
    uncertainty: point.uncertainty,
  }));

  const top = steps[0];
  const rationale = top ? rationaleFor(top, steps) : [];
  const fields = fieldGrids(sensors);

  return {
    generatedAt: new Date().toISOString(),
    installed,
    before,
    after,
    current,
    sensors: sensors.length,
    bySector: bySector(currentVariance, sensors),
    plan: planList,
    curve,
    rationale,
    coverageField: fields.coverage,
    uncertaintyField: fields.uncertainty,
    method: { lengthScale: LENGTH, noise: NOISE, threshold: THRESHOLD },
  };
}

function rationaleFor(top: Plan["steps"][number], steps: Plan["steps"]) {
  const nearest = model.sensors
    .filter((s) => s.type === "pressure" || s.type === "flow")
    .map((s) => ({ s, d: distance(s.xy, top.xy) }))
    .sort((a, b) => a.d - b.d)[0];
  let nearPoints = 0;
  const nearbySectors = new Set<string>();
  for (let i = 0; i < P; i += 1) {
    if (Math.hypot((px[i] ?? 0) - top.xy[0], (py[i] ?? 0) - top.xy[1]) >= 900) continue;
    nearPoints += 1;
    const sector = pointSector[i];
    if (sector) nearbySectors.add(sector);
  }
  const networkKm = round(nearPoints * 0.21, 1);
  const incidents = top.sector ? params(top.sector).incidents12m : 0;
  const sectorName = top.sector ? sectorById.get(top.sector)?.name : null;
  const maxGain = Math.max(...steps.map((s) => s.gain));
  return [
    {
      title: "Alta incerteza no local",
      detail: `Hoje o modelo explica só ${Math.round((1 - top.localVariance) * 100)}% do que acontece neste ponto da rede.`,
      weight: Math.round(top.localVariance * 100),
    },
    {
      title: "Lacuna de telemetria",
      detail: nearest
        ? `O sensor mais próximo (${nearest.s.id}) está a ${(nearest.d / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km.`
        : "Nenhum sensor no entorno.",
      weight: Math.round(clamp((nearest?.d ?? 3000) / 2500, 0, 1) * 100),
    },
    {
      title: nearbySectors.size >= 3 ? "Interseção de setores" : "Fronteira entre setores",
      detail: `Num raio de 900 m a rede atende ${nearbySectors.size} ${nearbySectors.size === 1 ? "setor" : "setores"} (${[...nearbySectors].join(" · ")}).`,
      weight: Math.round(clamp(nearbySectors.size / 3, 0, 1) * 100),
    },
    {
      title: "Densidade de rede",
      detail: `≈ ${networkKm.toLocaleString("pt-BR")} km de tubulação a menos de 900 m${top.street ? `, na ${top.street}` : ""}.`,
      weight: Math.round(clamp(networkKm / 30, 0, 1) * 100),
    },
    {
      title: "Histórico de incidentes",
      detail: `${incidents} reparos nos últimos 12 meses no setor ${top.sector ?? "—"}${sectorName ? ` (${sectorName})` : ""}.`,
      weight: Math.round(clamp(incidents / 5, 0, 1) * 100),
    },
    {
      title: "Maior ganho de informação",
      detail: `Entre ${model.sensing.candidates.length} locais candidatos, é o que mais reduz a incerteza somada da rede.`,
      weight: Math.round((top.gain / (maxGain || 1)) * 100),
    },
  ];
}
