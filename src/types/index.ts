/**
 * Tipos compartilhados do AquaGraph.
 *
 * `Severity` é a espinha dorsal semântica do produto: alimenta badges, cores de
 * mapa, ordenação de listas e legendas. Qualquer indicador operacional deve ser
 * traduzido para um destes níveis antes de chegar à interface.
 */
export type Severity = "normal" | "attention" | "high" | "critical" | "info";

export type Priority = "Baixa" | "Média" | "Alta" | "Crítica";

export type ModuleKey = "perdas" | "seca" | "enchentes" | "sensing" | "infra";

export type Point = { x: number; y: number };

/** Ponto de interesse desenhado sobre o mapa operacional. */
export type MapMarker = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  level: Severity;
  kind?: "alert" | "asset" | "facility";
};

export type OperationalEvent = {
  id: string;
  place: string;
  context?: string;
  issue: string;
  metric: string;
  metricHint?: string;
  level: Severity;
  age?: string;
};

export type RecommendedAction = {
  id: string;
  action: string;
  rationale: string;
  horizon: string;
  priority: Priority;
  level: Severity;
  module: ModuleKey;
};

export type DecisionRow = {
  id: string;
  action: string;
  type: string;
  module: ModuleKey;
  place: string;
  impact: string;
  confidence: number;
  priority: Priority;
  status: "Pendente" | "Simulada" | "Planejada" | "Em execução" | "Concluída";
  level: Severity;
};
