import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { severityLabel } from "@/lib/severity";
import { glossary, type GlossaryKey } from "@/lib/glossary";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Severity } from "@/types";
import type { DataOrigin } from "@/types/api";

export type Tone = "cyan" | "blue" | "teal" | "success" | "warning" | "high" | "critical";

// ---------------------------------------------------------------------------
// Explicações (tooltips)
// ---------------------------------------------------------------------------

type Explanation = GlossaryKey | { term: string; definition: string };

function resolve(explanation: Explanation) {
  return typeof explanation === "string" ? glossary[explanation] : explanation;
}

/** Ícone ⓘ com a explicação de um indicador ou conceito. */
export function InfoTip({
  explain,
  side = "top",
}: {
  explain: Explanation;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const entry = resolve(explain);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="info-tip" aria-label={`O que é: ${entry.term}`}>
          <Info />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="glossary-tip">
        <strong>{entry.term}</strong>
        <span>{entry.definition}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Termo técnico sublinhado que explica a si mesmo ao passar o mouse. */
export function Term({ explain, children }: { explain: Explanation; children: ReactNode }) {
  const entry = resolve(explain);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="term" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="glossary-tip">
        <strong>{entry.term}</strong>
        <span>{entry.definition}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  real: "Dado real",
  simulado: "Simulado",
  modelo: "Modelo",
};
const ORIGIN_HINT: Record<DataOrigin, string> = {
  real: "Vem de fonte pública ao vivo ou do OpenStreetMap.",
  simulado: "Leitura de sensor sintético, gerada pelo motor de simulação do AquaGraph.",
  modelo: "Resultado de cálculo do modelo a partir dos dados (estimativa, não medição).",
};

/** Selo de origem: deixa explícito o que é real, simulado ou calculado. */
export function OriginBadge({ origin, label }: { origin: DataOrigin; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("origin-badge", `origin-${origin}`)} tabIndex={0}>
          <i />
          {label ?? ORIGIN_LABEL[origin]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="glossary-tip">
        <span>{ORIGIN_HINT[origin]}</span>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Narrativa
// ---------------------------------------------------------------------------

/** Faixa de abertura da tela: o que está acontecendo, em uma ou duas frases. */
export function StoryBanner({
  icon: Icon,
  level = "info",
  title,
  children,
  aside,
}: {
  icon: LucideIcon;
  level?: Severity;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={cn("story-banner", `level-${level}`)}>
      <span className="story-icon">
        <Icon />
      </span>
      <div className="story-text">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {aside && <div className="story-aside">{aside}</div>}
    </section>
  );
}

/** Cabeçalho numerado das seções da narrativa (01 Dados coletados, 02 Riscos...). */
export function SectionHeading({
  index,
  title,
  description,
  aside,
}: {
  index: number;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <span className="section-index">{String(index).padStart(2, "0")}</span>
      <div className="section-heading-text">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside && <div className="section-heading-aside">{aside}</div>}
    </header>
  );
}

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
  info,
}: {
  title: string;
  hint?: string | undefined;
  action?: ReactNode;
  icon?: LucideIcon | undefined;
  info?: Explanation | undefined;
}) {
  return (
    <header className="panel-header">
      <div className="panel-heading">
        {Icon && <Icon className="panel-heading-icon" />}
        <h2>{title}</h2>
        {info && <InfoTip explain={info} />}
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
  info,
  origin,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string | undefined;
  delta?: string | undefined;
  deltaTone?: "positive" | "negative" | "neutral";
  hint?: string | undefined;
  tone?: Tone;
  spark?: number[] | undefined;
  sparkKind?: "area" | "bars";
  progress?: number | undefined;
  status?: Severity | undefined;
  info?: Explanation | undefined;
  origin?: DataOrigin | undefined;
}) {
  return (
    <article className={cn("kpi-card", spark && "has-spark")}>
      <span className={cn("kpi-icon", `tone-${tone}`)}>
        <Icon />
      </span>
      <div className="kpi-main">
        <span className="kpi-label">
          {label}
          {info && <InfoTip explain={info} />}
          {origin && (
            <i className={cn("kpi-origin", `origin-${origin}`)} title={ORIGIN_LABEL[origin]} />
          )}
        </span>
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

export function MetricGrid({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  return <div className={cn("metric-grid", `metric-grid-${columns}`)}>{children}</div>;
}

export function Metric({
  label,
  value,
  tone,
  hint,
  info,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone | undefined;
  hint?: string | undefined;
  info?: Explanation | undefined;
}) {
  return (
    <div className="metric">
      <span className="metric-label">
        {label}
        {info && <InfoTip explain={info} />}
      </span>
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

/** Bloco de carregamento com a mesma geometria do conteúdo final. */
export function LoadingBlock({
  height = 120,
  label = "Carregando dados…",
}: {
  height?: number;
  label?: string;
}) {
  return (
    <div className="loading-block" style={{ minHeight: height }}>
      <span className="map-loading-dot" />
      {label}
    </div>
  );
}
