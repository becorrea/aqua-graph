/**
 * Navegação e identidade das telas.
 *
 * A ordem do menu é a ordem da história: a visão geral mostra a cidade, os
 * três desafios operacionais vêm em seguida, e a inteligência (onde observar
 * e o que fazer) fecha o ciclo dados → decisão.
 */
import {
  Activity,
  BrainCircuit,
  CloudRain,
  Droplets,
  Gauge,
  RadioTower,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; to: string; icon: LucideIcon; hint: string };
export type NavSection = { group?: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    items: [
      {
        label: "Visão Geral",
        to: "/",
        icon: Gauge,
        hint: "A cidade agora: dados, riscos e decisões do dia",
      },
    ],
  },
  {
    group: "Operação",
    items: [
      {
        label: "Perdas e Vazamentos",
        to: "/perdas",
        icon: Activity,
        hint: "Detecção de vazamentos não visíveis por setor",
      },
      {
        label: "Seca e Resiliência",
        to: "/seca",
        icon: Droplets,
        hint: "Produção × consumo e teste de estresse do abastecimento",
      },
      {
        label: "Enchentes e Resposta",
        to: "/enchentes",
        icon: Waves,
        hint: "Chuva prevista, drenagem e pontos críticos",
      },
    ],
  },
  {
    group: "Inteligência",
    items: [
      {
        label: "Active Sensing",
        to: "/active-sensing",
        icon: RadioTower,
        hint: "Onde um novo sensor reduz mais a incerteza",
      },
      {
        label: "Centro de Decisões",
        to: "/decisoes",
        icon: BrainCircuit,
        hint: "Fila única de ações com impacto e confiança",
      },
    ],
  },
];

export type PageMeta = { title: string; subtitle: string; icon: LucideIcon };

export const defaultPageMeta: PageMeta = {
  title: "Centro Operacional",
  subtitle: "Visão integrada da situação hídrica da cidade",
  icon: Droplets,
};

export const pageMeta: Record<string, PageMeta> = {
  "/": defaultPageMeta,
  "/perdas": {
    title: "Perdas e Vazamentos",
    subtitle: "Detecção preditiva de anomalias e priorização inteligente de inspeções",
    icon: Activity,
  },
  "/seca": {
    title: "Seca e Resiliência",
    subtitle: "Produção × consumo e teste de estresse do abastecimento",
    icon: Droplets,
  },
  "/enchentes": {
    title: "Enchentes e Resposta Rápida",
    subtitle: "Chuva prevista, drenagem e resposta antes do pico",
    icon: CloudRain,
  },
  "/active-sensing": {
    title: "Active Sensing",
    subtitle: "Onde observar para reduzir a incerteza operacional",
    icon: RadioTower,
  },
  "/decisoes": {
    title: "Centro de Decisões",
    subtitle: "Todas as recomendações do modelo, com impacto, confiança e status",
    icon: BrainCircuit,
  },
};
