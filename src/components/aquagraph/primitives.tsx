import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { severityLabel } from "@/lib/severity";
import type { Severity } from "@/types";

export type Tone = "cyan" | "blue" | "teal" | "success" | "warning" | "high" | "critical";

// ---------------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------------

export function Panel({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** Remove o padding interno — usado por mapas e tabelas. */
  flush?: boolean;
}) {
  return <section className={cn("panel", flush && "panel-flush", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  hint,
  action,
  icon: Icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <header className="panel-header">
      <div className="panel-heading">
        {Icon && <Icon className="panel-heading-icon" />}
        <h2>{title}</h2>
        {hint && <span className="panel-hint">{hint}</span>}
      </div>
      {action && <div className="panel-action">{action}</div>}
    </header>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel-body", className)}>{children}</div>;
}

export function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="panel-footer">{children}</div>;
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export function StatusBadge({
  level,
  children,
  subtle = false,
}: {
  level: Severity;
  children?: ReactNode;
  subtle?: boolean;
}) {
  return (
    <span className={cn("status-badge", `level-${level}`, subtle && "status-badge-subtle")}>
      <i className="status-dot" />
      {children ?? severityLabel[level]}
    </span>
  );
}

export function TrendPill({
  value,
  suffix = "",
  invert = false,
  hint,
}: {
  value: number;
  suffix?: string;
  /** Quando `true`, queda é positiva (caso das perdas de água). */
  invert?: boolean;
  hint?: string;
}) {
  const rising = value > 0;
  const good = invert ? !rising : rising;
  const tone = value === 0 ? "neutral" : good ? "positive" : "negative";
  const Icon = value === 0 ? Minus : rising ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("trend-pill", `trend-${tone}`)}>
      <Icon />
      {Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
      {suffix}
      {hint && <em>{hint}</em>}
    </span>
  );
}

/** Sparkline desenhada à mão: leve o suficiente para viver dentro de um KPI. */
export function Sparkline({
  data,
  tone = "cyan",
  height = 34,
}: {
  data: number[];
  tone?: Tone;
  height?: number;
}) {
  const gradientId = useId();
  if (data.length < 2) return null;

  const width = 78;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const coords = data.map((value, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - 4 - ((value - min) / span) * (height - 10),
  }));
  const points = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lastY = coords[coords.length - 1]?.y ?? height / 2;

  return (
    <svg
      className={cn("sparkline", `tone-${tone}`)}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.38" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline points={points} />
      <circle cx={width} cy={lastY} r="2" />
    </svg>
  );
}

export function MiniBars({ data, tone = "cyan" }: { data: number[]; tone?: Tone }) {
  const max = Math.max(...data) || 1;
  return (
    <div className={cn("mini-bars", `tone-${tone}`)} role="presentation">
      {data.map((value, index) => (
        <i key={index} style={{ height: `${Math.max(14, (value / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  hint,
  tone = "cyan",
  spark,
  sparkKind = "area",
  progress,
  status,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  hint?: string;
  tone?: Tone;
  spark?: number[];
  sparkKind?: "area" | "bars";
  progress?: number;
  status?: Severity;
}) {
  return (
    <article className="kpi-card">
      <span className={cn("kpi-icon", `tone-${tone}`)}>
        <Icon />
      </span>
      <div className="kpi-main">
        <span className="kpi-label">{label}</span>
        <div className="kpi-value-row">
          <strong className="kpi-value">
            {value}
            {unit && <em>{unit}</em>}
          </strong>
          {delta && <span className={cn("kpi-delta", `delta-${deltaTone}`)}>{delta}</span>}
          {status && <StatusBadge level={status} />}
        </div>
        {hint && <small className="kpi-hint">{hint}</small>}
      </div>
      {spark &&
        (sparkKind === "bars" ? (
          <MiniBars data={spark} tone={tone} />
        ) : (
          <Sparkline data={spark} tone={tone} />
        ))}
      {typeof progress === "number" && (
        <div className={cn("kpi-progress", `tone-${tone}`)}>
          <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </article>
  );
}

export function KpiStrip({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return <div className={cn("kpi-strip", `kpi-strip-${columns}`)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Blocos de leitura
// ---------------------------------------------------------------------------

export function MetricGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <div className={cn("metric-grid", `metric-grid-${columns}`)}>{children}</div>;
}

export function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className={cn("metric-value", tone && `text-${tone}`)}>{value}</strong>
      {hint && <small className="metric-hint">{hint}</small>}
    </div>
  );
}

export function SubTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sub-title">
      <h3>{children}</h3>
      {action}
    </div>
  );
}

/** Barra de confiança do modelo — sempre acompanhada do valor em texto. */
export function ConfidenceBar({
  value,
  label = "Confiança do modelo",
}: {
  value: number;
  label?: string;
}) {
  return (
    <div className="confidence">
      <div className="confidence-top">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="confidence-track">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("segmented", size === "sm" && "segmented-sm")} role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          className={cn(option.id === value && "active")}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LiveTag({ children }: { children: ReactNode }) {
  return (
    <span className="live-tag">
      <i />
      {children}
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}
