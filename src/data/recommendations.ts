/**
 * Recomendações consolidadas da plataforma.
 *
 * É a camada que fecha a narrativa dados → inteligência → previsão →
 * recomendação → ação: tudo que os módulos produzem desemboca aqui.
 */
import type { DecisionRow, OperationalEvent, RecommendedAction } from "@/types";

/** Eventos que abrem o Centro Operacional, já ordenados por severidade. */
export const priorityEvents: OperationalEvent[] = [
  {
    id: "EV-01",
    place: "Setor 14-B",
    context: "Centro",
    issue: "Possível vazamento",
    metric: "87%",
    metricHint: "Probabilidade",
    level: "critical",
    age: "Há 2h",
  },
  {
    id: "EV-02",
    place: "Reservatório Norte",
    context: "Alto da Serra",
    issue: "Tendência de escassez",
    metric: "53 dias",
    metricHint: "Até criticidade",
    level: "attention",
    age: "Há 6h",
  },
  {
    id: "EV-03",
    place: "Avenida B",
    context: "Jd. das Flores",
    issue: "Risco hidrológico",
    metric: "1h20",
    metricHint: "Até nível crítico",
    level: "high",
    age: "Há 12 min",
  },
  {
    id: "EV-04",
    place: "Setor 17-C",
    context: "Alto da Serra",
    issue: "Incerteza acima do limite do modelo",
    metric: "31%",
    metricHint: "Incerteza",
    level: "info",
    age: "Há 1h",
  },
];

export const overviewActions: RecommendedAction[] = [
  {
    id: "AC-01",
    action: "Inspecionar setor 14-B",
    rationale: "Probabilidade de vazamento de 87% com volume estimado elevado",
    horizon: "Próximas 4h",
    priority: "Alta",
    level: "critical",
    module: "perdas",
  },
  {
    id: "AC-02",
    action: "Avaliar redução de pressão noturna",
    rationale: "Amplia o horizonte de abastecimento em até 25 dias",
    horizon: "Hoje",
    priority: "Alta",
    level: "high",
    module: "seca",
  },
  {
    id: "AC-03",
    action: "Verificar galeria 231",
    rationale: "Risco de obstrução antes do pico de chuva previsto",
    horizon: "15 min",
    priority: "Alta",
    level: "high",
    module: "enchentes",
  },
  {
    id: "AC-04",
    action: "Planejar instalação do sensor S-27",
    rationale: "Maior ganho informacional da rede atual (+21 p.p. de cobertura)",
    horizon: "Este mês",
    priority: "Média",
    level: "attention",
    module: "sensing",
  },
];

export const decisionRows: DecisionRow[] = [
  {
    id: "DEC-2048",
    action: "Inspecionar setor 14-B",
    type: "Perdas",
    module: "perdas",
    place: "Setor 14-B",
    impact: "Alto",
    confidence: 87,
    priority: "Crítica",
    status: "Pendente",
    level: "critical",
  },
  {
    id: "DEC-2047",
    action: "Reduzir pressão noturna",
    type: "Seca",
    module: "seca",
    place: "Setor Leste",
    impact: "+25 dias",
    confidence: 91,
    priority: "Alta",
    status: "Simulada",
    level: "high",
  },
  {
    id: "DEC-2046",
    action: "Inspecionar galeria 231",
    type: "Enchente",
    module: "enchentes",
    place: "Centro",
    impact: "Alto",
    confidence: 89,
    priority: "Alta",
    status: "Pendente",
    level: "critical",
  },
  {
    id: "DEC-2045",
    action: "Instalar sensor S-27",
    type: "Active Sensing",
    module: "sensing",
    place: "Setor 17-C",
    impact: "+21 p.p.",
    confidence: 86,
    priority: "Alta",
    status: "Planejada",
    level: "attention",
  },
  {
    id: "DEC-2044",
    action: "Mobilizar equipe para bomba 07",
    type: "Enchente",
    module: "enchentes",
    place: "Ribeirão — jusante",
    impact: "Alto",
    confidence: 84,
    priority: "Alta",
    status: "Em execução",
    level: "high",
  },
  {
    id: "DEC-2043",
    action: "Priorizar tubos 481 e 492",
    type: "Perdas",
    module: "perdas",
    place: "Setor 14-B",
    impact: "41–58 m³/h",
    confidence: 79,
    priority: "Alta",
    status: "Pendente",
    level: "high",
  },
  {
    id: "DEC-2042",
    action: "Transferir volume entre setores",
    type: "Seca",
    module: "seca",
    place: "08-C → 21-D",
    impact: "+18 dias",
    confidence: 88,
    priority: "Média",
    status: "Simulada",
    level: "attention",
  },
  {
    id: "DEC-2041",
    action: "Verificar válvula do setor 08-C",
    type: "Perdas",
    module: "perdas",
    place: "VRP-14",
    impact: "Médio",
    confidence: 76,
    priority: "Média",
    status: "Pendente",
    level: "attention",
  },
  {
    id: "DEC-2040",
    action: "Alertar Defesa Civil",
    type: "Enchente",
    module: "enchentes",
    place: "Jd. das Flores",
    impact: "Médio",
    confidence: 82,
    priority: "Média",
    status: "Concluída",
    level: "normal",
  },
  {
    id: "DEC-2039",
    action: "Substituir telemetria S-17",
    type: "Active Sensing",
    module: "sensing",
    place: "Setor 21-D",
    impact: "+4 p.p.",
    confidence: 71,
    priority: "Baixa",
    status: "Planejada",
    level: "normal",
  },
];

export const decisionSummary = {
  open: decisionRows.filter((row) => row.status === "Pendente").length,
  simulated: decisionRows.filter((row) => row.status === "Simulada").length,
  running: decisionRows.filter((row) => row.status === "Em execução").length,
  averageConfidence: Math.round(
    decisionRows.reduce((sum, row) => sum + row.confidence, 0) / decisionRows.length,
  ),
};

export const decisionFilters = ["Todos", "Perdas", "Seca", "Enchente", "Active Sensing"] as const;

export const overviewKpis = {
  lossRate: 12.4,
  lossRateTrend: -2.1,
  reservoirLevel: 42,
  reservoirTrend: -8,
  criticalAreas: 8,
  criticalAreasTrend: 2,
  modelConfidence: 92,
};

/** Sparklines dos KPIs — série curta o suficiente para ler como tendência. */
export const kpiSparklines = {
  loss: [17.2, 16.1, 15.2, 14.6, 13.7, 13.2, 12.4],
  reservoir: [71, 66, 61, 55, 50, 46, 42],
  criticalAreas: [3, 4, 4, 5, 6, 6, 8],
  confidence: [84, 86, 87, 89, 90, 91, 92],
};
