/**
 * Blocos narrativos compartilhados: a trilha dados → ação, os cartões de
 * situação por desafio e a linha do tempo do dia.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  Database,
  Droplets,
  RadioTower,
  ShieldAlert,
  Waves,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LiveSnapshot, ModuleHeadline, ModuleKey, TimelineEvent } from "@/types/api";
import { StatusBadge } from "./primitives";

const MODULE_META: Record<ModuleKey, { label: string; to: string; icon: LucideIcon }> = {
  perdas: { label: "Perdas e vazamentos", to: "/perdas", icon: Activity },
  seca: { label: "Seca e resiliência", to: "/seca", icon: Droplets },
  enchentes: { label: "Enchentes", to: "/enchentes", icon: Waves },
  sensing: { label: "Active Sensing", to: "/active-sensing", icon: RadioTower },
};

export const moduleMeta = MODULE_META;

type Step = {
  stage: string;
  value: string;
  hint: string;
  explain: string;
  icon: LucideIcon;
  tone?: "alert" | undefined;
};

/** Trilha DADOS → INTELIGÊNCIA → RISCOS → RECOMENDAÇÕES → AÇÃO com os números do momento. */
export function StoryPipeline({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const p = snapshot?.pipeline;
  const steps: Step[] = [
    {
      stage: "Dados coletados",
      value: p ? `${p.sensors} sensores` : "—",
      hint: p
        ? `${p.readingsLastHour.toLocaleString("pt-BR")} leituras na última hora`
        : "conectando…",
      explain:
        "Vazão, pressão, nível de reservatórios, chuva e córregos — mais o mapa real (OpenStreetMap) e o clima real (Open-Meteo).",
      icon: Database,
    },
    {
      stage: "Inteligência",
      value: p ? `${p.models} modelos` : "—",
      hint: "perdas · seca · enchentes · sensing",
      explain:
        "Cada modelo compara o que os sensores medem com o que a física da rede espera e calcula probabilidades e projeções.",
      icon: BrainCircuit,
    },
    {
      stage: "Riscos detectados",
      value: p ? `${p.risks} ${p.risks === 1 ? "risco" : "riscos"}` : "—",
      hint: p ? `${p.criticalRisks} crítico${p.criticalRisks === 1 ? "" : "s"}` : "",
      explain:
        "Setores com indício de vazamento, sistemas com margem de produção apertada e pontos de alagamento sob a chuva prevista.",
      icon: ShieldAlert,
      tone: p && p.criticalRisks > 0 ? "alert" : undefined,
    },
    {
      stage: "Recomendações",
      value: p ? `${p.recommendations} ações` : "—",
      hint: "priorizadas por impacto × confiança",
      explain:
        "O que fazer agora, com impacto estimado e a confiança do modelo — todas reunidas no Centro de Decisões.",
      icon: ClipboardCheck,
    },
    {
      stage: "Ação em campo",
      value: p ? `${p.openOrders + p.runningOrders} ordens` : "—",
      hint: p ? `${p.runningOrders} em execução · ${p.openOrders} abertas` : "",
      explain:
        "Ordens de serviço geradas a partir das recomendações e acompanhadas até a conclusão.",
      icon: Wrench,
    },
  ];
  return (
    <div className="pipeline-strip">
      {steps.map((step, index) => (
        <Tooltip key={step.stage}>
          <TooltipTrigger asChild>
            <div className={cn("pipeline-step", step.tone === "alert" && "is-alert")} tabIndex={0}>
              <span className="pipeline-index">{String(index + 1).padStart(2, "0")}</span>
              <step.icon className="pipeline-icon" />
              <span className="pipeline-text">
                <small>{step.stage}</small>
                <strong>{step.value}</strong>
                <i>{step.hint}</i>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="glossary-tip">
            <strong>{step.stage}</strong>
            <span>{step.explain}</span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Cartão de situação de um desafio, com atalho para o módulo. */
export function ChallengeCard({ headline }: { headline: ModuleHeadline }) {
  const meta = MODULE_META[headline.module];
  const Icon = meta.icon;
  return (
    <Link to={meta.to} className={cn("challenge-card", `level-${headline.level}`)}>
      <span className="challenge-icon">
        <Icon />
      </span>
      <span className="challenge-main">
        <span className="challenge-top">
          <small>{meta.label}</small>
          <StatusBadge level={headline.level} subtle />
        </span>
        <strong>{headline.title}</strong>
        <span className="challenge-detail">{headline.detail}</span>
      </span>
      <span className="challenge-metric">
        <b>{headline.metric}</b>
        <i>{headline.metricLabel}</i>
        <ArrowRight />
      </span>
    </Link>
  );
}

const TIMELINE_ICON: Record<TimelineEvent["module"], LucideIcon> = {
  perdas: Activity,
  seca: Droplets,
  enchentes: Waves,
  sensing: RadioTower,
  operacao: Wrench,
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="timeline">
      {events.map((event) => {
        const Icon = TIMELINE_ICON[event.module];
        return (
          <li key={event.id} className={`level-${event.level}`}>
            <span className="timeline-time">{event.time}</span>
            <span className="timeline-dot">
              <Icon />
            </span>
            <span className="timeline-text">
              <strong>{event.title}</strong>
              <small>{event.detail}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Seção narrativa: cabeçalho numerado + conteúdo. */
export function StorySection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("story-section", className)}>{children}</section>;
}
