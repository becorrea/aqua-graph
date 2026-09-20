/**
 * Navegação e identidade das telas.
 *
 * O cabeçalho da aplicação lê o título/subtítulo a partir daqui, então cada
 * rota é descrita em um único lugar.
 */
import {
  Activity,
  BrainCircuit,
  ChartNoAxesCombined,
  CloudRain,
  Droplets,
  Gauge,
  Network,
  RadioTower,
  Settings,
  Waves,
  Wrench,
  FileText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; to: string; icon: LucideIcon };
export type NavSection = { group?: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    items: [{ label: "Visão Geral", to: "/", icon: Gauge }],
  },
  {
    group: "Operação",
    items: [
      { label: "Perdas e Vazamentos", to: "/perdas", icon: Activity },
      { label: "Seca e Resiliência", to: "/seca", icon: Droplets },
      { label: "Enchentes e Resposta", to: "/enchentes", icon: Waves },
    ],
  },
  {
    group: "Inteligência",
    items: [
      { label: "Active Sensing", to: "/active-sensing", icon: RadioTower },
      { label: "Centro de Decisões", to: "/decisoes", icon: BrainCircuit },
      { label: "Infraestrutura", to: "/infraestrutura", icon: Network },
      { label: "Consumo", to: "/consumo", icon: ChartNoAxesCombined },
    ],
  },
  {
    group: "Gestão",
    items: [
      { label: "Manutenção", to: "/manutencao", icon: Wrench },
      { label: "Relatórios", to: "/relatorios", icon: FileText },
    ],
  },
];

export const settingsNavItem: NavItem = {
  label: "Configurações",
  to: "/configuracoes",
  icon: Settings,
};

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
    subtitle: "Projeção de criticidade, cenários operacionais e resposta preventiva",
    icon: Droplets,
  },
  "/enchentes": {
    title: "Enchentes e Resposta Rápida",
    subtitle: "Antecipação de risco hidrológico e coordenação operacional em tempo quase real",
    icon: CloudRain,
  },
  "/active-sensing": {
    title: "Active Sensing",
    subtitle: "A inteligência que indica onde observar para reduzir incerteza operacional",
    icon: RadioTower,
  },
  "/decisoes": {
    title: "Centro de Decisões",
    subtitle: "Todas as recomendações do modelo, com impacto, confiança e status",
    icon: BrainCircuit,
  },
  "/infraestrutura": {
    title: "Rede e Infraestrutura",
    subtitle: "Ativos, idade da rede e criticidade estrutural por setor",
    icon: Network,
  },
  "/consumo": {
    title: "Consumo",
    subtitle: "Demanda por setor, padrões de uso e grandes consumidores",
    icon: ChartNoAxesCombined,
  },
  "/manutencao": {
    title: "Manutenção",
    subtitle: "Ordens de serviço, equipes de campo e execução em andamento",
    icon: Wrench,
  },
  "/relatorios": {
    title: "Relatórios",
    subtitle: "Indicadores regulatórios e consolidações operacionais",
    icon: FileText,
  },
  "/configuracoes": {
    title: "Configurações",
    subtitle: "Parâmetros do modelo, alertas e integrações da plataforma",
    icon: Settings,
  },
};
