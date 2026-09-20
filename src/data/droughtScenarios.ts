/**
 * Cenários operacionais de seca.
 *
 * Cada cenário guarda o dia em que a projeção cruza a zona crítica; o gráfico
 * de tendência é reconstruído a partir desse valor, então selecionar uma
 * hipótese muda de fato a curva — não apenas o texto.
 */
import type { Severity } from "@/types";

export type DroughtScenario = {
  id: string;
  name: string;
  detail: string;
  criticalDay: number;
  gain: number | null;
  variation: string;
};

/** Linha de base sem intervenção — referência para todos os ganhos. */
export const baselineScenario: DroughtScenario = {
  id: "atual",
  name: "Cenário atual (tendência)",
  detail: "Sem intervenção operacional adicional",
  criticalDay: 53,
  gain: null,
  variation: "—",
};

export const droughtScenarios: DroughtScenario[] = [
  baselineScenario,
  {
    id: "pressao",
    name: "Redução de pressão noturna",
    detail: "Setores Leste e Sul entre 23h e 05h",
    criticalDay: 78,
    gain: 25,
    variation: "+47%",
  },
  {
    id: "transferencia",
    name: "Transferência entre setores",
    detail: "Via adutoras existentes, sem obra",
    criticalDay: 71,
    gain: 18,
    variation: "+34%",
  },
  {
    id: "campanha",
    name: "Campanha direcionada de consumo",
    detail: "Residencial e comercial de grande porte",
    criticalDay: 69,
    gain: 16,
    variation: "+30%",
  },
];

export const droughtActions = [
  {
    id: "DR-01",
    action: "Implementar redução de pressão noturna",
    rationale: "Setores Leste e Sul",
    impact: "+25 dias",
    priority: "Alta" as const,
    level: "high" as Severity,
  },
  {
    id: "DR-02",
    action: "Iniciar campanha direcionada de consumo",
    rationale: "Residencial e comercial",
    impact: "+16 dias",
    priority: "Alta" as const,
    level: "high" as Severity,
  },
  {
    id: "DR-03",
    action: "Transferir volume entre setores",
    rationale: "Via adutoras existentes",
    impact: "+18 dias",
    priority: "Média" as const,
    level: "attention" as Severity,
  },
  {
    id: "DR-04",
    action: "Antecipar manutenção preventiva",
    rationale: "Elevatórias e grandes consumidores",
    impact: "+12 dias",
    priority: "Média" as const,
    level: "attention" as Severity,
  },
];

/** Regiões destacadas no mapa de estiagem, com o horizonte de cada uma. */
export const droughtRegions = [
  { id: "12-A", label: "Setor Norte", days: 38 },
  { id: "14-B", label: "Setor Centro", days: 62 },
  { id: "21-D", label: "Setor Leste", days: 28 },
];

export function droughtLevel(days: number): Severity {
  if (days <= 30) return "critical";
  if (days <= 45) return "high";
  if (days <= 60) return "attention";
  return "normal";
}

export const droughtLegend = [
  { level: "normal" as Severity, label: "Risco baixo" },
  { level: "attention" as Severity, label: "Risco moderado" },
  { level: "high" as Severity, label: "Risco alto" },
  { level: "critical" as Severity, label: "Risco crítico" },
];

export type RainfallOutlook = "normal" | "abaixo" | "critica";

export const rainfallOutlooks: Array<{ id: RainfallOutlook; label: string; penalty: number }> = [
  { id: "normal", label: "Normal", penalty: 0 },
  { id: "abaixo", label: "Abaixo da média", penalty: 9 },
  { id: "critica", label: "Crítica", penalty: 19 },
];

/**
 * Modelo simplificado do simulador: cada medida soma dias ao horizonte e a
 * previsão de chuva desconta. Os pesos reproduzem os ganhos dos cenários
 * pré-calculados acima.
 */
export function simulateHorizon(input: {
  pressureReduction: number;
  transfer: boolean;
  campaign: boolean;
  rainfall: RainfallOutlook;
}) {
  const penalty = rainfallOutlooks.find((item) => item.id === input.rainfall)?.penalty ?? 0;
  const pressureGain = Math.round(input.pressureReduction * 1.25);
  const transferGain = input.transfer ? 18 : 0;
  const campaignGain = input.campaign ? 16 : 0;
  const total = 53 + pressureGain + transferGain + campaignGain - penalty;
  return {
    baseline: 53,
    horizon: Math.max(18, total),
    pressureGain,
    transferGain,
    campaignGain,
    penalty,
  };
}
