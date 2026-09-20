import type { Severity } from "@/types";

export const severityLabel: Record<Severity, string> = {
  normal: "Normal",
  attention: "Atenção",
  high: "Alto",
  critical: "Crítico",
  info: "Monitorado",
};

/** Token CSS de cada nível — mantém mapa, badges e gráficos na mesma escala. */
export const severityColor: Record<Severity, string> = {
  normal: "var(--ag-success)",
  attention: "var(--ag-warning)",
  high: "var(--ag-high)",
  critical: "var(--ag-critical)",
  info: "var(--ag-blue)",
};

export const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  attention: 2,
  info: 3,
  normal: 4,
};

export function severityFromProbability(probability: number): Severity {
  if (probability >= 80) return "critical";
  if (probability >= 70) return "high";
  if (probability >= 60) return "attention";
  if (probability >= 45) return "info";
  return "normal";
}

export function formatNumber(value: number, decimals = 1) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSigned(value: number, decimals = 1) {
  const formatted = formatNumber(Math.abs(value), decimals);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}
