/**
 * Dados de apoio dos módulos de gestão (infraestrutura, consumo, manutenção,
 * relatórios e configurações).
 */
import { sectorProfiles } from "./city";
import type { Priority, Severity } from "@/types";

export type InfrastructureRow = {
  sector: string;
  district: string;
  extension: number;
  averageAge: number;
  ironShare: number;
  breaksPerYear: number;
  criticality: Severity;
};

/** Cadastro técnico por setor, derivado do perfil operacional. */
export const infrastructureRows: InfrastructureRow[] = [
  { sector: "14-B", extension: 184, averageAge: 38, ironShare: 62, breaksPerYear: 41 },
  { sector: "08-C", extension: 241, averageAge: 31, ironShare: 48, breaksPerYear: 36 },
  { sector: "21-D", extension: 206, averageAge: 24, ironShare: 34, breaksPerYear: 22 },
  { sector: "12-A", extension: 219, averageAge: 41, ironShare: 66, breaksPerYear: 38 },
  { sector: "17-C", extension: 148, averageAge: 17, ironShare: 18, breaksPerYear: 9 },
  { sector: "05-E", extension: 162, averageAge: 22, ironShare: 27, breaksPerYear: 14 },
  { sector: "33-G", extension: 131, averageAge: 19, ironShare: 21, breaksPerYear: 11 },
  { sector: "41-H", extension: 176, averageAge: 29, ironShare: 44, breaksPerYear: 26 },
  { sector: "29-F", extension: 175, averageAge: 26, ironShare: 38, breaksPerYear: 19 },
].map((row) => {
  const profile = sectorProfiles.find((item) => item.id === row.sector);
  const criticality: Severity =
    row.averageAge >= 38
      ? "critical"
      : row.averageAge >= 28
        ? "high"
        : row.averageAge >= 20
          ? "attention"
          : "normal";
  return { ...row, district: profile?.district ?? "—", criticality };
});

export const infrastructureKpis = {
  extension: infrastructureRows.reduce((sum, row) => sum + row.extension, 0),
  averageAge: 27.5,
  ironShare: 40,
  assets: 231,
};

export type ConsumptionRow = {
  sector: string;
  district: string;
  demand: number;
  perCapita: number;
  variation: number;
  billedShare: number;
};

export const consumptionRows: ConsumptionRow[] = [
  { sector: "08-C", demand: 262, perCapita: 148, variation: 4.1, billedShare: 84 },
  { sector: "21-D", demand: 238, perCapita: 152, variation: 6.8, billedShare: 81 },
  { sector: "12-A", demand: 226, perCapita: 144, variation: 1.9, billedShare: 86 },
  { sector: "14-B", demand: 214, perCapita: 161, variation: 9.4, billedShare: 72 },
  { sector: "41-H", demand: 186, perCapita: 141, variation: 3.2, billedShare: 85 },
  { sector: "29-F", demand: 178, perCapita: 138, variation: 2.4, billedShare: 88 },
  { sector: "05-E", demand: 164, perCapita: 136, variation: -1.2, billedShare: 90 },
  { sector: "17-C", demand: 151, perCapita: 133, variation: 0.6, billedShare: 91 },
  { sector: "33-G", demand: 142, perCapita: 129, variation: -0.4, billedShare: 89 },
].map((row) => ({
  ...row,
  district: sectorProfiles.find((item) => item.id === row.sector)?.district ?? "—",
}));

/** Curva de consumo horário médio da cidade, em m³/s. */
export const consumptionCurve = [
  { hour: "00h", current: 0.92, reference: 0.88 },
  { hour: "03h", current: 0.81, reference: 0.71 },
  { hour: "06h", current: 1.34, reference: 1.28 },
  { hour: "09h", current: 1.58, reference: 1.49 },
  { hour: "12h", current: 1.62, reference: 1.54 },
  { hour: "15h", current: 1.48, reference: 1.41 },
  { hour: "18h", current: 1.71, reference: 1.6 },
  { hour: "21h", current: 1.29, reference: 1.24 },
];

export const largeConsumers = [
  { name: "Hospital Municipal Central", sector: "14-B", volume: "6.240 m³/mês", trend: 3.2 },
  { name: "Indústria Alimentos Ribeirão", sector: "33-G", volume: "5.810 m³/mês", trend: -1.8 },
  { name: "Shopping Vale das Águas", sector: "21-D", volume: "4.470 m³/mês", trend: 7.4 },
  { name: "Universidade Estadual", sector: "05-E", volume: "3.920 m³/mês", trend: 0.9 },
  { name: "Condomínio Parque Norte", sector: "12-A", volume: "3.140 m³/mês", trend: 4.6 },
];

export const consumptionKpis = {
  demand: 1.42,
  demandTrend: 12,
  perCapita: 143,
  billedShare: 84,
  nightFlowShare: 21,
};

export type WorkOrder = {
  id: string;
  service: string;
  asset: string;
  team: string;
  deadline: string;
  priority: Priority;
  level: Severity;
  status: "Aberta" | "Em execução" | "Aguardando material" | "Concluída";
  origin: string;
};

export const workOrders: WorkOrder[] = [
  {
    id: "OS-AG-2048",
    service: "Inspeção acústica de rede",
    asset: "Setor 14-B · Tubo 481",
    team: "Campo 03",
    deadline: "Hoje 14:30",
    priority: "Alta",
    level: "critical",
    status: "Aberta",
    origin: "Perdas e Vazamentos",
  },
  {
    id: "OS-AG-2047",
    service: "Desobstrução de galeria",
    asset: "Galeria 231 · Centro",
    team: "Drenagem 01",
    deadline: "Hoje 12:00",
    priority: "Alta",
    level: "critical",
    status: "Em execução",
    origin: "Enchentes e Resposta",
  },
  {
    id: "OS-AG-2046",
    service: "Revisão de bomba",
    asset: "EB-07 · Ribeirão",
    team: "Eletromecânica",
    deadline: "Hoje 16:00",
    priority: "Alta",
    level: "high",
    status: "Em execução",
    origin: "Enchentes e Resposta",
  },
  {
    id: "OS-AG-2044",
    service: "Ajuste de válvula redutora",
    asset: "VRP-14 · Setor 14-B",
    team: "Campo 01",
    deadline: "Amanhã 09:00",
    priority: "Média",
    level: "attention",
    status: "Aguardando material",
    origin: "Perdas e Vazamentos",
  },
  {
    id: "OS-AG-2041",
    service: "Instalação de macromedidor",
    asset: "Setor 17-C · Interseção",
    team: "Telemetria",
    deadline: "12 Fev",
    priority: "Média",
    level: "attention",
    status: "Aberta",
    origin: "Active Sensing",
  },
  {
    id: "OS-AG-2038",
    service: "Substituição de trecho",
    asset: "Setor 12-A · Tubo 318",
    team: "Campo 02",
    deadline: "28 Jan",
    priority: "Baixa",
    level: "normal",
    status: "Concluída",
    origin: "Manutenção preventiva",
  },
];

export const fieldTeams = [
  { id: "Campo 01", specialty: "Rede de distribuição", load: 62, open: 4 },
  { id: "Campo 02", specialty: "Substituição de trechos", load: 48, open: 3 },
  { id: "Campo 03", specialty: "Pesquisa de vazamentos", load: 88, open: 6 },
  { id: "Drenagem 01", specialty: "Galerias e bocas de lobo", load: 74, open: 5 },
  { id: "Eletromecânica", specialty: "Bombas e elevatórias", load: 55, open: 2 },
  { id: "Telemetria", specialty: "Sensores e macromedição", load: 34, open: 2 },
];

export const maintenanceKpis = {
  open: workOrders.filter((order) => order.status === "Aberta").length,
  running: workOrders.filter((order) => order.status === "Em execução").length,
  averageResponse: 4.2,
  preventiveShare: 38,
};

export const regulatoryReports = [
  {
    id: "SNIS-2025",
    name: "SNIS — Diagnóstico Água e Esgoto",
    period: "Exercício 2025",
    status: "Consolidado",
    updated: "18 Jan 2026",
  },
  {
    id: "IN049",
    name: "IN049 — Índice de perdas na distribuição",
    period: "Jan 2026",
    status: "Em fechamento",
    updated: "26 Jan 2026",
  },
  {
    id: "ARSESP-Q4",
    name: "Relatório de qualidade — ARSESP",
    period: "4º trimestre 2025",
    status: "Enviado",
    updated: "09 Jan 2026",
  },
  {
    id: "PMSB",
    name: "Plano Municipal de Saneamento — revisão",
    period: "Ciclo 2026–2030",
    status: "Em elaboração",
    updated: "22 Jan 2026",
  },
];

export const reportIndicators = [
  {
    label: "IN049 — Perdas na distribuição",
    value: "12,4%",
    target: "≤ 15%",
    level: "normal" as Severity,
  },
  {
    label: "IN013 — Perdas de faturamento",
    value: "16,8%",
    target: "≤ 18%",
    level: "normal" as Severity,
  },
  {
    label: "IN022 — Consumo per capita",
    value: "143 L/hab·dia",
    target: "≤ 150",
    level: "normal" as Severity,
  },
  {
    label: "IN023 — Atendimento urbano",
    value: "98,7%",
    target: "≥ 98%",
    level: "normal" as Severity,
  },
  {
    label: "IN073 — Economias intermitentes",
    value: "2,1%",
    target: "≤ 2%",
    level: "attention" as Severity,
  },
  {
    label: "IN085 — Extravasamentos",
    value: "0,9 / 100 km",
    target: "≤ 1,0",
    level: "attention" as Severity,
  },
];

export const modelSettings = [
  {
    id: "leak-threshold",
    label: "Limite de alerta de vazamento",
    detail: "Probabilidade mínima para abrir anomalia automática",
    value: 70,
    unit: "%",
  },
  {
    id: "drought-threshold",
    label: "Zona crítica de reservatório",
    detail: "Volume abaixo do qual o sistema entra em restrição",
    value: 25,
    unit: "%",
  },
  {
    id: "flood-threshold",
    label: "Acumulado de chuva para alerta",
    detail: "Precipitação projetada em 3 horas",
    value: 45,
    unit: "mm",
  },
  {
    id: "uncertainty-threshold",
    label: "Incerteza máxima aceitável",
    detail: "Acima deste valor o Active Sensing sugere novos pontos",
    value: 20,
    unit: "%",
  },
];

export const integrations = [
  {
    id: "scada",
    name: "SCADA — Centro de Controle",
    status: "Conectado",
    latency: "1,2 s",
    level: "normal" as Severity,
  },
  {
    id: "telemetry",
    name: "Telemetria IoT (18 pontos)",
    status: "Conectado",
    latency: "4,8 s",
    level: "normal" as Severity,
  },
  {
    id: "weather",
    name: "Radar meteorológico regional",
    status: "Conectado",
    latency: "4 min",
    level: "normal" as Severity,
  },
  {
    id: "gis",
    name: "GIS corporativo — cadastro de rede",
    status: "Sincronizado",
    latency: "24 h",
    level: "attention" as Severity,
  },
  {
    id: "billing",
    name: "Sistema comercial — faturamento",
    status: "Sincronizado",
    latency: "24 h",
    level: "attention" as Severity,
  },
  {
    id: "civil",
    name: "Defesa Civil municipal",
    status: "Aguardando homologação",
    latency: "—",
    level: "high" as Severity,
  },
];

export const alertChannels = [
  {
    id: "console",
    label: "Console operacional",
    detail: "Notificações em tempo real no painel",
    enabled: true,
  },
  {
    id: "email",
    label: "E-mail para coordenação",
    detail: "Resumo consolidado a cada 30 minutos",
    enabled: true,
  },
  { id: "sms", label: "SMS para plantão", detail: "Somente severidade crítica", enabled: true },
  {
    id: "webhook",
    label: "Webhook para Defesa Civil",
    detail: "Eventos hidrológicos de risco alto",
    enabled: false,
  },
];
