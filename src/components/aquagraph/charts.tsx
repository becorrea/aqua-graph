/**
 * Utilitários de gráfico.
 *
 * Centraliza tooltip, eixos e grade para que todos os módulos compartilhem a
 * mesma leitura visual — densidade baixa de linhas-guia, rótulos pequenos e
 * números tabulares.
 */
import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export const AXIS = {
  stroke: "oklch(0.5544 0.0407 257.42 / 0.5)",
  tick: { fill: "var(--ag-text-3)", fontSize: 10 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: "oklch(0.8276 0.1013 230.32 / 0.09)",
  strokeDasharray: "3 4",
  vertical: false,
} as const;

/** Margem padrão: recuo zero à esquerda porque o eixo Y já reserva a sua faixa. */
export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const;

export function ChartFrame({
  height,
  children,
  className,
}: {
  height: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("chart-frame", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

type TooltipEntry = {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
};

export function AgTooltip({
  active,
  payload,
  label,
  unit = "",
  decimals = 1,
  caption,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit?: string;
  decimals?: number;
  caption?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label">{label}</span>
      <ul>
        {payload
          .filter((entry) => entry.value !== null && entry.value !== undefined)
          .map((entry, index) => (
            <li key={`${entry.dataKey}-${index}`}>
              <i style={{ background: entry.color }} />
              <span>{entry.name}</span>
              <b>
                {typeof entry.value === "number"
                  ? entry.value.toLocaleString("pt-BR", {
                      minimumFractionDigits: decimals,
                      maximumFractionDigits: decimals,
                    })
                  : entry.value}
                {unit}
              </b>
            </li>
          ))}
      </ul>
      {caption && <small className="chart-tooltip-caption">{caption}</small>}
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: ReadonlyArray<{ label: string; color: string; dashed?: boolean }>;
}) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <i
            className={cn(item.dashed && "is-dashed")}
            style={{
              background: item.dashed ? "transparent" : item.color,
              borderColor: item.color,
            }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
