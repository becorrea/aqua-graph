/**
 * Centro de decisões: transforma os resultados dos quatro modelos numa fila
 * única de ações, com impacto estimado, confiança e prioridade — e guarda o
 * que o operador decidiu (status e ordens de serviço).
 *
 * O que o operador decidiu (ordens de serviço) viaja num cookie — ver
 * "Estado operacional" abaixo.
 */
import type {
  Decision,
  DecisionsResponse,
  DroughtResponse,
  FloodResponse,
  LossesResponse,
  RainMode,
  SensingResponse,
  WorkOrder,
} from "@/types/api";
import type { Priority, Severity } from "@/types";
import { model, sectorById, toLngLat } from "../geo/model.server";
import { HOUR, MINUTE, formatRelative } from "./core.server";
import { getDrought } from "./drought.server";
import { getFlood } from "./flood.server";
import { getLosses } from "./losses.server";
import { getSensing } from "./sensing.server";

const PRIORITY_ORDER: Record<Priority, number> = { Crítica: 0, Alta: 1, Média: 2, Baixa: 3 };
const LEVEL_OF: Record<Priority, Severity> = {
  Crítica: "critical",
  Alta: "high",
  Média: "attention",
  Baixa: "normal",
};

type Draft = Omit<Decision, "status" | "workOrder" | "level"> & {
  defaultStatus: Decision["status"];
};

// ---------------------------------------------------------------------------
// Estado operacional (cookie do navegador)
// ---------------------------------------------------------------------------

/**
 * As ordens de serviço abertas pelo operador viajam num cookie, não na
 * memória do servidor. Em hospedagem serverless (Cloudflare Workers) cada
 * requisição pode cair numa instância diferente; com o estado no cookie,
 * qualquer instância reconstrói a mesma fila. Numa implantação real esta
 * camada seria o sistema de ordens de serviço da companhia.
 */
type StoredOrder = {
  /** Recomendação de origem. */
  d: string;
  /** Criação (segundos desde a época). */
  t: number;
  ti: string;
  a: string;
  te: string;
  p: Priority;
  /** Prazo em horas a partir da criação. */
  h: number;
};

export type OpsState = { orders: StoredOrder[] };

export const OPS_COOKIE = "ag_ops";
const MAX_ORDERS = 15;
const FIRST_ORDER = 2048;
const PRIORITIES: Priority[] = ["Crítica", "Alta", "Média", "Baixa"];

function toBase64Url(text: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const isStoredOrder = (value: unknown): value is StoredOrder => {
  const o = value as Partial<StoredOrder> | null;
  return (
    typeof o === "object" &&
    o !== null &&
    typeof o.d === "string" &&
    typeof o.t === "number" &&
    typeof o.ti === "string" &&
    typeof o.a === "string" &&
    typeof o.te === "string" &&
    typeof o.h === "number" &&
    PRIORITIES.includes(o.p as Priority)
  );
};

/** Lê o estado operacional do cookie da requisição (vazio se ausente/inválido). */
export function readOps(request: Request): OpsState {
  const header = request.headers.get("cookie") ?? "";
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OPS_COOKIE}=`))
    ?.slice(OPS_COOKIE.length + 1);
  if (!raw) return { orders: [] };
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    const orders = Array.isArray(parsed) ? parsed.filter(isStoredOrder).slice(-MAX_ORDERS) : [];
    return { orders };
  } catch {
    return { orders: [] };
  }
}

/** Cabeçalho Set-Cookie com o novo estado (válido por 7 dias). */
export function opsCookie(state: OpsState) {
  const value = toBase64Url(JSON.stringify(state.orders.slice(-MAX_ORDERS)));
  return `${OPS_COOKIE}=${value}; Path=/; Max-Age=604800; SameSite=Lax`;
}

/** Assinatura curta do estado, para chaves de cache. */
export function opsKey(state: OpsState) {
  const last = state.orders[state.orders.length - 1];
  return `${state.orders.length}:${last?.t ?? 0}`;
}

/** Ordens de exemplo já existentes no turno (relativas ao horário atual). */
function seededOrders(now: number): WorkOrder[] {
  const tiberio = sectorById.get("33-G");
  const hotspot = model.hotspots[1] ?? model.hotspots[0];
  return [
    {
      id: "OS-AG-2045",
      decisionId: null,
      title: `Reparo de vazamento visível — ${tiberio?.name ?? "Vila Tibério"}`,
      asset: "Setor 33-G · ramal predial",
      team: "Equipe Campo 01",
      priority: "Alta",
      deadline: formatRelative(now + 3 * HOUR, now),
      status: "Em execução",
      createdAt: new Date(now - 2.5 * HOUR).toISOString(),
    },
    {
      id: "OS-AG-2046",
      decisionId: null,
      title: `Limpeza de bocas de lobo — ${hotspot?.name ?? "Centro"}`,
      asset: hotspot?.gallery ?? "Galeria",
      team: "Equipe Drenagem 02",
      priority: "Média",
      deadline: formatRelative(now - HOUR, now),
      status: "Concluída",
      createdAt: new Date(now - 9 * HOUR).toISOString(),
    },
    {
      id: "OS-AG-2047",
      decisionId: null,
      title: "Aferição de macromedidor VZ-04 — Centro",
      asset: "VZ-04 · entrada do setor 08-C",
      team: "Equipe Instrumentação",
      priority: "Média",
      deadline: formatRelative(now + 26 * HOUR, now),
      status: "Aberta",
      createdAt: new Date(now - 5 * HOUR).toISOString(),
    },
  ];
}

/** Ordem aberta pelo operador: "Aberta" nos primeiros 15 min, depois "Em execução". */
function toWorkOrder(order: StoredOrder, index: number, now: number): WorkOrder {
  const created = order.t * 1000;
  return {
    id: `OS-AG-${FIRST_ORDER + index}`,
    decisionId: order.d,
    title: order.ti,
    asset: order.a,
    team: order.te,
    priority: order.p,
    deadline: formatRelative(
      Math.ceil((created + order.h * HOUR) / (30 * MINUTE)) * 30 * MINUTE,
      now,
    ),
    status: now - created < 15 * MINUTE ? "Aberta" : "Em execução",
    createdAt: new Date(created).toISOString(),
  };
}

export function workOrders(ops: OpsState, now = Date.now()) {
  return [...seededOrders(now), ...ops.orders.map((order, i) => toWorkOrder(order, i, now))].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

// ---------------------------------------------------------------------------
// Geração das recomendações a partir dos modelos
// ---------------------------------------------------------------------------

const fmt = (value: number, digits = 0) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: digits });

function lossDrafts(losses: LossesResponse): Draft[] {
  const drafts: Draft[] = [];
  const top = losses.selected;
  for (const sector of losses.sectors) {
    const info = sectorById.get(sector.id);
    if (sector.leakProbability >= 60) {
      const isTop = top.id === sector.id;
      const candidate = isTop ? top.candidates[0] : undefined;
      const excess = isTop
        ? Math.max(0, top.inflow - top.expectedInflow) * 3.6
        : sector.lostM3h * 0.2;
      const priority: Priority = sector.leakProbability >= 80 ? "Crítica" : "Alta";
      drafts.push({
        id: `DEC-PERDAS-${sector.id}`,
        module: "perdas",
        action: candidate
          ? `Inspecionar trecho ${candidate.id} — ${candidate.street ?? info?.name ?? ""}`
          : `Pesquisa de vazamento no setor ${sector.id}`,
        type: "Perdas",
        place: `Setor ${sector.id} · ${sector.name}`,
        rationale: `Probabilidade de vazamento de ${sector.leakProbability}%: vazão noturna e pressão fora do padrão.`,
        impact: `${fmt(excess)} m³/h`,
        confidence: sector.leakProbability,
        priority,
        horizon: priority === "Crítica" ? "Próximas 4 h" : "Próximas 24 h",
        lngLat: candidate?.lngLat ?? sector.lngLat,
        defaultStatus: "Pendente",
      });
      if (sector.leakProbability >= 80) {
        drafts.push({
          id: `DEC-PRESSAO-${sector.id}`,
          module: "perdas",
          action: `Reduzir pressão no setor ${sector.id} até o reparo`,
          type: "Perdas",
          place: `VRP do setor ${sector.id}`,
          rationale:
            "Vazamento cresce com a pressão (∝ √P): −15% de pressão reduz a perda até a equipe chegar.",
          impact: `−${fmt(excess * (1 - Math.sqrt(0.85)) + sector.lostM3h * 0.08)} m³/h`,
          confidence: 82,
          priority: "Alta",
          horizon: "Imediato",
          lngLat: sector.lngLat,
          defaultStatus: "Pendente",
        });
      }
    } else if (sector.leakProbability >= 35) {
      drafts.push({
        id: `DEC-PERDAS-${sector.id}`,
        module: "perdas",
        action: `Pesquisa acústica programada no setor ${sector.id}`,
        type: "Perdas",
        place: `Setor ${sector.id} · ${sector.name}`,
        rationale: `Sinal fraco (${sector.leakProbability}%) — confirmar antes que o volume perdido cresça.`,
        impact: `${fmt(sector.lostM3h * 0.12)} m³/h`,
        confidence: sector.leakProbability + 20,
        priority: "Média",
        horizon: "Esta semana",
        lngLat: sector.lngLat,
        defaultStatus: "Pendente",
      });
    }
  }
  return drafts;
}

function droughtDrafts(drought: DroughtResponse): Draft[] {
  const focus = drought.systems.find((s) => s.id === drought.focus);
  if (!focus || focus.severity === "normal") return [];
  const scenario = (id: string) => drought.scenarios.find((s) => s.id === id);
  const gain = (id: string) => {
    const s = scenario(id);
    if (!s) return "—";
    if (s.daysToCritical === null) return `> ${drought.horizonDays} dias`;
    return s.gain === null ? `${s.daysToCritical} dias` : `+${s.gain} dias`;
  };
  const source = model.systems.find((s) => s.id === focus.id)?.source;
  const reservoir =
    model.reservoirs.find((r) => r.id === source) ??
    model.reservoirs.find((r) => r.system === focus.id);
  const where = reservoir ? toLngLat(reservoir.xy) : null;
  const transfer = scenario("transferencia");
  return [
    {
      id: `DEC-SECA-PRESSAO-${focus.id}`,
      module: "seca",
      action: `Gestão de pressão nas VRPs do ${focus.name}`,
      type: "Seca",
      place: focus.sectorNames.join(" · "),
      rationale:
        "Menos pressão, menos vazamento de fundo (FAVAD): a água economizada sustenta a reservação.",
      impact: gain("pressao"),
      confidence: 86,
      priority: "Alta",
      horizon: "Hoje, 23h",
      lngLat: where,
      defaultStatus: "Simulada",
    },
    {
      id: `DEC-SECA-TRANSF-${focus.id}`,
      module: "seca",
      action: `Transferência para o ${focus.name}`,
      type: "Seca",
      place: transfer?.detail ?? "Adutoras existentes",
      rationale:
        "O sistema vizinho tem sobra de produção hoje; a manobra usa adutoras existentes, sem obra.",
      impact: gain("transferencia"),
      confidence: 81,
      priority: "Alta",
      horizon: "48 h",
      lngLat: where,
      defaultStatus: "Simulada",
    },
    {
      id: `DEC-SECA-CAMPANHA-${focus.id}`,
      module: "seca",
      action: `Campanha de consumo — ${focus.name}`,
      type: "Seca",
      place: focus.sectorNames.join(" · "),
      rationale:
        "Aviso direcionado a grandes consumidores e bairros com consumo per capita mais alto.",
      impact: gain("campanha"),
      confidence: 74,
      priority: "Média",
      horizon: "Esta semana",
      lngLat: where,
      defaultStatus: "Planejada",
    },
  ];
}

function floodDrafts(flood: FloodResponse): Draft[] {
  const drafts: Draft[] = [];
  const active = flood.hotspots.filter((h) => h.level === "critical" || h.level === "high");
  if (active.length === 0) {
    const first = flood.hotspots[0];
    if (first) {
      drafts.push({
        id: `DEC-DRENAGEM-PREV-${first.id}`,
        module: "enchentes",
        action: `Limpeza preventiva da ${first.gallery}`,
        type: "Enchente",
        place: first.name,
        rationale: `Ponto mais suscetível da cidade (${first.stream}); manter a galeria livre antes do próximo temporal.`,
        impact: "Capacidade plena",
        confidence: 77,
        priority: "Média",
        horizon: "Antes da próxima chuva",
        lngLat: first.lngLat,
        defaultStatus: "Planejada",
      });
    }
    return drafts;
  }
  for (const hotspot of active.slice(0, 3)) {
    const critical = hotspot.level === "critical";
    const eta = hotspot.minutesToCritical !== null ? `${hotspot.minutesToCritical} min` : "1 h";
    drafts.push({
      id: `DEC-GALERIA-${hotspot.id}`,
      module: "enchentes",
      action: `Desobstruir ${hotspot.gallery} — ${hotspot.name}`,
      type: "Enchente",
      place: `${hotspot.name} · ${hotspot.stream}`,
      rationale: `Vazão de pico prevista em ${Math.round(hotspot.peakRatio * 100)}% da capacidade da galeria.`,
      impact: critical ? "Reduz lâmina d'água" : "Ganha capacidade",
      confidence: flood.mode === "extreme" ? 88 : 79,
      priority: critical ? "Crítica" : "Alta",
      horizon: eta,
      lngLat: hotspot.lngLat,
      defaultStatus: "Pendente",
    });
    if (critical) {
      drafts.push({
        id: `DEC-BLOQUEIO-${hotspot.id}`,
        module: "enchentes",
        action: `Bloquear tráfego na ${hotspot.name}`,
        type: "Enchente",
        place: `${hotspot.name} · trecho junto ao ${hotspot.stream}`,
        rationale: "Lâmina acima de 30 cm prevista: risco a pedestres e veículos.",
        impact: "Evita vítimas",
        confidence: 85,
        priority: "Alta",
        horizon: `Antes de ${eta}`,
        lngLat: hotspot.lngLat,
        defaultStatus: "Pendente",
      });
      const facility = hotspot.facilities.find(
        (f) => f.kind === "Hospital" || f.kind === "Terminal rodoviário",
      );
      if (facility) {
        drafts.push({
          id: `DEC-AVISO-${hotspot.id}-${facility.id}`,
          module: "enchentes",
          action: `Avisar ${facility.name} sobre rota alternativa`,
          type: "Enchente",
          place: `${fmt(facility.distance)} m do ponto crítico`,
          rationale: "Acesso principal pode ficar alagado; ambulâncias e ônibus devem desviar.",
          impact: "Acesso garantido",
          confidence: 80,
          priority: "Média",
          horizon: "Imediato",
          lngLat: hotspot.lngLat,
          defaultStatus: "Pendente",
        });
      }
    }
  }
  if (active.some((h) => h.level === "critical")) {
    drafts.push({
      id: "DEC-DEFESA-CIVIL",
      module: "enchentes",
      action: "Alertar a Defesa Civil",
      type: "Enchente",
      place: active
        .map((h) => h.name)
        .slice(0, 3)
        .join(" · "),
      rationale: "Mais de um ponto deve ultrapassar a capacidade de drenagem na mesma janela.",
      impact: "Resposta coordenada",
      confidence: 84,
      priority: "Média",
      horizon: "Imediato",
      lngLat: null,
      defaultStatus: "Pendente",
    });
  }
  return drafts;
}

function sensingDrafts(sensing: SensingResponse): Draft[] {
  return sensing.plan.slice(0, 2).map((candidate) => ({
    id: `DEC-SENSOR-${candidate.id}`,
    module: "sensing" as const,
    action: `Instalar sensor ${candidate.id} (pressão + vazão)`,
    type: "Active Sensing",
    place: `${candidate.street ?? "Rede principal"} · setor ${candidate.sector ?? "—"}`,
    rationale: `Maior ganho de informação da rede: incerteza cai ${fmt(candidate.uncertaintyDrop, 1)} p.p.`,
    impact: `+${fmt(candidate.coverageGain, 1)} p.p. cobertura`,
    confidence: candidate.rank === 1 ? 86 : 82,
    priority: candidate.priority,
    horizon: "Este mês",
    lngLat: candidate.lngLat,
    defaultStatus: "Planejada",
  }));
}

export type ModelOutputs = {
  losses: LossesResponse;
  drought: DroughtResponse;
  flood: FloodResponse;
  sensing: SensingResponse;
};

export async function modelOutputs(
  rainMode: RainMode,
  installed: number,
  now = Date.now(),
): Promise<ModelOutputs> {
  const [drought, flood] = await Promise.all([
    getDrought({ system: null, scenario: null, custom: null }, now),
    getFlood(rainMode, now),
  ]);
  return { losses: getLosses(null, now), drought, flood, sensing: getSensing(installed) };
}

export function buildDecisions(outputs: ModelOutputs, ops: OpsState): Decision[] {
  const orders = workOrders(ops);
  const drafts = [
    ...lossDrafts(outputs.losses),
    ...floodDrafts(outputs.flood),
    ...droughtDrafts(outputs.drought),
    ...sensingDrafts(outputs.sensing),
  ];
  return drafts
    .map(({ defaultStatus, ...draft }) => {
      const order = orders.find((o) => o.decisionId === draft.id);
      const status = order ? "Em execução" : defaultStatus;
      return {
        ...draft,
        confidence: Math.min(95, Math.round(draft.confidence)),
        level: LEVEL_OF[draft.priority],
        status,
        workOrder: order?.id ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.status === "Concluída") - Number(b.status === "Concluída") ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        b.confidence - a.confidence,
    );
}

export async function getDecisions(
  rainMode: RainMode,
  installed: number,
  ops: OpsState,
): Promise<DecisionsResponse> {
  const decisions = buildDecisions(await modelOutputs(rainMode, installed), ops);
  const orders = workOrders(ops);
  return {
    generatedAt: new Date().toISOString(),
    decisions,
    workOrders: orders,
    summary: {
      pending: decisions.filter((d) => d.status === "Pendente").length,
      running:
        decisions.filter((d) => d.status === "Em execução").length +
        orders.filter((o) => o.status === "Em execução" && !o.decisionId).length,
      simulated: decisions.filter((d) => d.status === "Simulada").length,
      averageConfidence: Math.round(
        decisions.reduce((sum, d) => sum + d.confidence, 0) / (decisions.length || 1),
      ),
    },
  };
}

const TEAMS: Record<Decision["module"], string> = {
  perdas: "Equipe Campo 03",
  seca: "Centro de Controle Operacional",
  enchentes: "Equipe Drenagem 02",
  sensing: "Equipe Instrumentação",
};

/**
 * Executa uma recomendação: abre a ordem de serviço e devolve o novo estado
 * operacional (que a rota grava no cookie).
 */
export async function executeDecision(
  id: string,
  rainMode: RainMode,
  installed: number,
  ops: OpsState,
) {
  const decisions = buildDecisions(await modelOutputs(rainMode, installed), ops);
  const decision = decisions.find((d) => d.id === id);
  if (!decision) throw new Error(`Recomendação não encontrada: ${id}`);
  const existing = workOrders(ops).find((o) => o.decisionId === id);
  if (existing) return { decision, workOrder: existing, ops };
  const now = Date.now();
  const hours = decision.priority === "Crítica" ? 4 : decision.priority === "Alta" ? 24 : 72;
  const next: OpsState = {
    orders: [
      ...ops.orders,
      {
        d: id,
        t: Math.floor(now / 1000),
        ti: decision.action,
        a: decision.place,
        te: TEAMS[decision.module],
        p: decision.priority,
        h: hours,
      },
    ],
  };
  const workOrder = workOrders(next, now).find((o) => o.decisionId === id) as WorkOrder;
  return {
    decision: { ...decision, status: "Em execução" as const, workOrder: workOrder.id },
    workOrder,
    ops: next,
  };
}
