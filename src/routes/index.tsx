import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BrainCircuit, Droplets, Gauge, TriangleAlert } from "lucide-react";
import { CityMap } from "@/components/aquagraph/CityMap";
import { ActionList, EventList } from "@/components/aquagraph/lists";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelFooter,
  PanelHeader,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { city, sectorProfileById, watchedSectors } from "@/data/city";
import { sectorById } from "@/data/cityGeometry";
import { sensors } from "@/data/sensors";
import { networkSummary } from "@/data/waterNetwork";
import {
  decisionRows,
  kpiSparklines,
  overviewActions,
  overviewKpis,
  priorityEvents,
} from "@/data/recommendations";
import { severityLabel } from "@/lib/severity";
import { pageHead } from "@/lib/route-head";
import type { MapMarker } from "@/types";

export const Route = createFileRoute("/")({
  head: pageHead(
    "Centro Operacional",
    "Visão integrada da situação hídrica de Ribeirão das Águas: perdas, reservatórios, risco hidrológico e ações prioritárias.",
  ),
  component: OverviewPage,
});

/** Focos operacionais destacados no mapa, um por setor monitorado. */
const overviewMarkers: MapMarker[] = watchedSectors.flatMap((id) => {
  const profile = sectorProfileById.get(id);
  const geometry = sectorById.get(id);
  if (!profile || !geometry) return [];
  return [
    {
      id,
      label: `Setor ${id}`,
      detail: `${profile.leakProbability}% · ${severityLabel[profile.level]}`,
      x: geometry.centroid.x,
      y: geometry.centroid.y,
      level: profile.level,
      kind: "alert" as const,
    },
  ];
});

const PIPELINE = [
  { stage: "Dados", value: `${sensors.length} sensores`, hint: "4 fontes integradas" },
  { stage: "Inteligência", value: "4 modelos", hint: "perdas, seca, chuva, sensing" },
  { stage: "Previsão", value: "72 h", hint: "horizonte operacional" },
  {
    stage: "Recomendação",
    value: `${decisionRows.filter((row) => row.status === "Pendente").length} abertas`,
    hint: `${decisionRows.length} no total`,
  },
  {
    stage: "Ação",
    value: `${decisionRows.filter((row) => row.status === "Em execução").length} em execução`,
    hint: "equipes de campo",
  },
];

function OverviewPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>{city.dataFreshness}</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            {networkSummary.extension} de rede · {networkSummary.connections} ·{" "}
            {networkSummary.sectors} setores
          </span>
        </div>
        <div className="toolbar-right">
          <Select defaultValue="24h">
            <SelectTrigger className="toolbar-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24 horas</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={Droplets}
          label="Perda estimada"
          value={`${overviewKpis.lossRate.toLocaleString("pt-BR")}%`}
          delta={`▼ ${Math.abs(overviewKpis.lossRateTrend).toLocaleString("pt-BR")} p.p.`}
          deltaTone="positive"
          hint="vs. mês anterior"
          tone="cyan"
          spark={kpiSparklines.loss}
        />
        <KpiCard
          icon={Gauge}
          label="Reservatórios"
          value={`${overviewKpis.reservoirLevel}%`}
          delta={`▼ ${Math.abs(overviewKpis.reservoirTrend)} p.p.`}
          deltaTone="negative"
          hint="nível médio ponderado"
          tone="warning"
          spark={kpiSparklines.reservoir}
          progress={overviewKpis.reservoirLevel}
        />
        <KpiCard
          icon={TriangleAlert}
          label="Áreas críticas"
          value={String(overviewKpis.criticalAreas)}
          delta={`▲ ${overviewKpis.criticalAreasTrend}`}
          deltaTone="negative"
          hint="setores em atenção ou pior"
          tone="critical"
          spark={kpiSparklines.criticalAreas}
          sparkKind="bars"
        />
        <KpiCard
          icon={BrainCircuit}
          label="Confiança do modelo"
          value={`${overviewKpis.modelConfidence}%`}
          delta="Alta confiabilidade"
          deltaTone="positive"
          hint="validação contínua com telemetria"
          tone="success"
          spark={kpiSparklines.confidence}
          progress={overviewKpis.modelConfidence}
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Mapa operacional"
            hint="situação em tempo quase real"
            action={
              <>
                <LiveTag>ao vivo</LiveTag>
                <Link to="/decisoes" className="panel-link">
                  Centro de decisões <ArrowRight />
                </Link>
              </>
            }
          />
          <CityMap
            variant="overview"
            markers={overviewMarkers}
            sectorLabels="codes"
            onSelectSector={(sectorId) => {
              if (sectorProfileById.has(sectorId)) void navigate({ to: "/perdas" });
            }}
          />
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Eventos prioritários"
              icon={TriangleAlert}
              action={
                <Link to="/decisoes" className="panel-link">
                  Ver todos <ArrowRight />
                </Link>
              }
            />
            <EventList items={priorityEvents} />
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Ações recomendadas"
              icon={BrainCircuit}
              action={<span className="panel-hint">ordenadas por retorno</span>}
            />
            <ActionList
              items={overviewActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                priority: action.priority,
                level: action.level,
                time: action.horizon,
              }))}
            />
            <PanelFooter>
              <Button asChild variant="operational" className="w-full">
                <Link to="/decisoes">Ver centro de decisões</Link>
              </Button>
            </PanelFooter>
          </Panel>
        </aside>
      </div>

      <div className="pipeline-strip">
        {PIPELINE.map((item, index) => (
          <div className="pipeline-step" key={item.stage}>
            <span className="pipeline-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="pipeline-text">
              <small>{item.stage}</small>
              <strong>{item.value}</strong>
              <i>{item.hint}</i>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
