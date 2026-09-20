/**
 * Módulo de perdas e vazamentos.
 *
 * Todos os números aqui são saídas de modelo, nunca medições diretas: a
 * interface precisa tratá-los como probabilidade e faixa estimada.
 */
import type { OperationalEvent, Severity } from "@/types";

export const leakKpis = {
  lossRate: 12.4,
  lossRateTrend: -2.1,
  lostVolume: 58,
  lostVolumeRange: "41–58 m³/h",
  criticalSectors: 8,
  criticalSectorsTrend: 2,
  confidence: 92,
};

export const sectorAnomalies: OperationalEvent[] = [
  {
    id: "AN-4812",
    place: "Setor 14-B",
    context: "Centro",
    issue: "Pressão abaixo do esperado",
    metric: "87%",
    metricHint: "Prob. de vazamento",
    level: "critical",
    age: "Há 2h",
  },
  {
    id: "AN-4809",
    place: "Setor 08-C",
    context: "Vila Nova",
    issue: "Variação anômala de vazão",
    metric: "76%",
    metricHint: "Prob. de vazamento",
    level: "high",
    age: "Há 4h",
  },
  {
    id: "AN-4804",
    place: "Setor 21-D",
    context: "Jd. Paulista",
    issue: "Consumo acima da faixa histórica",
    metric: "62%",
    metricHint: "Prob. de vazamento",
    level: "attention",
    age: "Há 6h",
  },
  {
    id: "AN-4798",
    place: "Setor 12-A",
    context: "Centro Norte",
    issue: "Padrão noturno atípico",
    metric: "58%",
    metricHint: "Prob. de vazamento",
    level: "info",
    age: "Há 8h",
  },
];

export type EvidenceFactor = {
  label: string;
  reading: string;
  direction: "down" | "up" | "flat";
  weight: number;
  level: Severity;
};

/** Fatores que compõem o score do alerta — base do painel de explicabilidade. */
export const evidenceFactors: EvidenceFactor[] = [
  { label: "Pressão", reading: "↓ 8%", direction: "down", weight: 88, level: "critical" },
  { label: "Vazão", reading: "↑ 16%", direction: "up", weight: 82, level: "high" },
  { label: "Consumo", reading: "≈ normal", direction: "flat", weight: 34, level: "normal" },
  { label: "Histórico", reading: "2 ocorrências", direction: "up", weight: 61, level: "attention" },
];

export const leakEvidence = [
  "Queda anormal de pressão sustentada por 9 ciclos consecutivos",
  "Vazão incompatível com o consumo faturado do setor",
  "Comportamento noturno atípico entre 02h e 04h",
  "Histórico de manutenção: 2 reparos no mesmo trecho em 24 meses",
];

/**
 * Ciclo hidráulico de 24h do setor 14-B. A divergência entre observado e
 * esperado nas madrugadas é a assinatura clássica de perda física.
 */
export const hydraulicDay = [
  { hour: "00h", pressure: 31.2, expectedPressure: 34.0, flow: 48, expectedFlow: 41 },
  { hour: "02h", pressure: 29.4, expectedPressure: 34.8, flow: 52, expectedFlow: 38 },
  { hour: "04h", pressure: 28.1, expectedPressure: 34.6, flow: 54, expectedFlow: 37 },
  { hour: "06h", pressure: 28.8, expectedPressure: 33.1, flow: 66, expectedFlow: 58 },
  { hour: "08h", pressure: 27.9, expectedPressure: 31.4, flow: 79, expectedFlow: 72 },
  { hour: "10h", pressure: 27.4, expectedPressure: 30.8, flow: 82, expectedFlow: 74 },
  { hour: "12h", pressure: 27.6, expectedPressure: 30.6, flow: 84, expectedFlow: 76 },
  { hour: "14h", pressure: 28.2, expectedPressure: 31.0, flow: 81, expectedFlow: 73 },
  { hour: "16h", pressure: 28.6, expectedPressure: 31.5, flow: 78, expectedFlow: 71 },
  { hour: "18h", pressure: 28.1, expectedPressure: 30.9, flow: 85, expectedFlow: 78 },
  { hour: "20h", pressure: 29.0, expectedPressure: 32.2, flow: 74, expectedFlow: 68 },
  { hour: "22h", pressure: 30.1, expectedPressure: 33.4, flow: 61, expectedFlow: 54 },
];

export const lossTrend = [
  { month: "Fev", loss: 17.2 },
  { month: "Mar", loss: 16.8 },
  { month: "Abr", loss: 16.1 },
  { month: "Mai", loss: 15.9 },
  { month: "Jun", loss: 15.2 },
  { month: "Jul", loss: 14.8 },
  { month: "Ago", loss: 14.6 },
  { month: "Set", loss: 14.1 },
  { month: "Out", loss: 13.7 },
  { month: "Nov", loss: 13.2 },
  { month: "Dez", loss: 12.9 },
  { month: "Jan", loss: 12.4 },
];

export const leakDetail = {
  sector: "14-B",
  district: "Centro",
  level: "critical" as Severity,
  probability: 87,
  estimatedLoss: "41–58 m³/h",
  pressureVariation: -8,
  flowVariation: 16,
  expectedConsumption: "Normal",
  lastMaintenanceDays: 118,
  connections: 16820,
  networkExtension: "184 km",
  averageAge: "38 anos",
  conclusion: "Os dados combinados indicam padrão consistente com perda física na rede.",
};

export const leakAction = {
  title: "Inspecionar setor 14-B",
  priority: "Alta" as const,
  window: "Próximas 4 horas",
  team: "Equipe Campo 03",
  rationale:
    "Maior retorno operacional entre as 8 anomalias abertas: alta probabilidade, volume estimado elevado e acesso viário simples.",
  order: {
    number: "OS-AG-2048",
    asset: "Setor 14-B",
    priority: "Alta",
    team: "Campo 03",
    deadline: "Hoje 14:30",
    type: "Inspeção acústica de rede",
  },
};

/** Sequência usada pelo botão "Simular evento" e pelo Modo Pitch. */
export const leakSimulationSteps = [42, 61, 74, 87];
