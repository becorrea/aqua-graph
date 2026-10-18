import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BrainCircuit, History, Map as MapIcon, Radar } from "lucide-react";
import { OpsMap, type MapMarkerSpec, type SectorStyle } from "@/components/map/OpsMap";
import { ActionList } from "@/components/aquagraph/lists";
import { useScenario } from "@/components/aquagraph/ScenarioContext";
import { ChallengeCard, StoryPipeline, Timeline } from "@/components/aquagraph/story";
import {
  LiveTag,
  LoadingBlock,
  Panel,
  PanelFooter,
  PanelHeader,
  StoryBanner,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { useLive, useMapBase } from "@/lib/api";
import { pageHead } from "@/lib/route-head";
import { formatAge, num, readingsById, signed } from "@/lib/format";
import type { LayerOption } from "@/components/map/OpsMap";

export const Route = createFileRoute("/")({
  head: pageHead(
    "Centro Operacional",
    "Ribeirão Preto em tempo quase real: perdas, abastecimento, risco hidrológico e as decisões do dia.",
  ),
  component: OverviewPage,
});

const LAYERS: LayerOption[] = [
  { id: "sectors", label: "Setores de abastecimento", on: true },
  { id: "network", label: "Adutoras e rede principal", on: true },
  { id: "secondary", label: "Rede secundária (zoom)", on: false },
  { id: "leak", label: "Probabilidade de vazamento", on: true },
  { id: "streams", label: "Córregos e galerias", on: true },
  { id: "reservoirs", label: "Reservatórios e poços", on: true },
  { id: "sensors", label: "Sensores IoT", on: true },
  { id: "facilities", label: "Infraestrutura crítica", on: false },
];

function OverviewPage() {
  const navigate = useNavigate();
  const scenario = useScenario();
  const live = useLive(scenario.rainMode, scenario.installed);
  const base = useMapBase();
  const snapshot = live.data;

  const readings = useMemo(() => readingsById(snapshot?.sensors), [snapshot]);

  const sectorStyles = useMemo(() => {
    const styles: Record<string, SectorStyle> = {};
    for (const sector of snapshot?.sectors ?? []) {
      styles[sector.id] = {
        level: sector.level,
        detail: `Prob. de vazamento ${sector.leakProbability}% · perda física ${num(sector.lossRate)}% · pressão ${signed(sector.pressureDeviation)}%`,
        ...(sector.leakProbability >= 35 ? { caption: `${sector.leakProbability}%` } : {}),
      };
    }
    return styles;
  }, [snapshot]);

  const heat = useMemo(
    () =>
      (snapshot?.sectors ?? [])
        .filter((sector) => sector.leakProbability >= 35)
        .flatMap((sector) => {
          const geo = base.data?.sectors.find((s) => s.id === sector.id);
          return geo ? [{ lngLat: geo.centroid, weight: sector.leakProbability / 100 }] : [];
        }),
    [snapshot, base.data],
  );

  const markers = useMemo<MapMarkerSpec[]>(
    () =>
      (snapshot?.headlines ?? [])
        .filter((h) => h.lngLat && (h.level !== "normal" || h.module === "sensing"))
        .map((h) => ({
          id: `headline-${h.module}`,
          lngLat: h.lngLat as [number, number],
          level: h.module === "sensing" ? "attention" : h.level,
          kind: h.module === "sensing" ? ("recommendation" as const) : ("alert" as const),
          label:
            h.module === "sensing"
              ? (h.detail.match(/S-\d+/)?.[0] ?? "Sensor")
              : (h.title.split(" · ")[0] ?? h.title),
          detail: `${h.metric} ${h.metricLabel}`,
          pulse: h.level === "critical",
          onClick: () =>
            void navigate({
              to:
                h.module === "perdas"
                  ? "/perdas"
                  : h.module === "seca"
                    ? "/seca"
                    : h.module === "enchentes"
                      ? "/enchentes"
                      : "/active-sensing",
            }),
          tooltip: (
            <>
              <header>
                <strong>{h.title}</strong>
                <span>
                  {h.metric} {h.metricLabel}
                </span>
              </header>
              <p>{h.detail}</p>
              <footer>
                <span className="map-tip-origin origin-modelo">Cálculo do modelo</span>
                <small>clique para abrir o módulo</small>
              </footer>
            </>
          ),
        })),
    [snapshot, navigate],
  );

  const critical =
    snapshot?.headlines.filter((h) => h.level === "critical" || h.level === "high") ?? [];
  const storyTitle = snapshot
    ? critical.length > 0
      ? `${critical.length} ${critical.length === 1 ? "situação exige" : "situações exigem"} atenção agora`
      : "Cidade operando dentro do esperado"
    : "Conectando ao motor de simulação…";

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>
            {snapshot ? `Atualizado ${formatAge(snapshot.generatedAt)}` : "Conectando…"}
          </LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            {snapshot
              ? `${snapshot.city.networkKm.toLocaleString("pt-BR")} km de rede · ${snapshot.city.connections.toLocaleString("pt-BR")} ligações · ${snapshot.city.sectors} setores · ${(snapshot.city.population / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil habitantes na área monitorada`
              : "Carregando a cidade…"}
          </span>
        </div>
        <div className="toolbar-right">
          <Button asChild variant="outline" size="sm">
            <Link to="/decisoes">
              <BrainCircuit />
              Centro de decisões
            </Link>
          </Button>
        </div>
      </div>

      <StoryBanner
        icon={Radar}
        level={
          critical.some((h) => h.level === "critical")
            ? "critical"
            : critical.length
              ? "high"
              : "normal"
        }
        title={storyTitle}
      >
        {snapshot
          ? snapshot.headlines
              .filter((h) => h.level !== "normal")
              .map((h) => h.detail)
              .slice(0, 2)
              .join(" ") || "Nenhum dos quatro modelos aponta risco relevante neste momento."
          : "Lendo sensores, clima e modelos."}
      </StoryBanner>

      <StoryPipeline snapshot={snapshot} />

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Mapa operacional"
            icon={MapIcon}
            hint="Ribeirão Preto · OpenStreetMap"
            info={{
              term: "Como ler o mapa",
              definition:
                "Vias, córregos, bairros, reservatórios e hospitais são reais (OpenStreetMap). Setores, rede sob as vias e sensores são o modelo do AquaGraph. Passe o mouse sobre qualquer elemento para saber o que é.",
            }}
            action={<LiveTag>{scenario.simulated ? "cenário simulado" : "ao vivo"}</LiveTag>}
          />
          {base.data ? (
            <OpsMap
              base={base.data}
              layers={LAYERS}
              sectorStyles={sectorStyles}
              readings={readings}
              heat={heat}
              markers={markers}
              onSelectSector={() => void navigate({ to: "/perdas" })}
              legend={{
                title: "Situação por setor",
                swatches: [
                  { level: "normal", label: "Normal" },
                  { level: "attention", label: "Atenção" },
                  { level: "high", label: "Alto" },
                  { level: "critical", label: "Crítico" },
                ],
              }}
            />
          ) : (
            <LoadingBlock height={520} label="Carregando mapa da cidade…" />
          )}
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader title="Situação por desafio" hint="clique para analisar" />
            <div className="challenge-list">
              {snapshot ? (
                snapshot.headlines.map((h) => <ChallengeCard key={h.module} headline={h} />)
              ) : (
                <LoadingBlock height={300} />
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="grid-2">
        <Panel flush>
          <PanelHeader title="Próximas decisões" icon={BrainCircuit} hint="impacto × confiança" />
          {snapshot ? (
            <ActionList
              items={snapshot.topActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                priority: action.priority,
                level: action.level,
                time: action.horizon,
                impact: action.impact,
              }))}
              onSelect={() => void navigate({ to: "/decisoes" })}
            />
          ) : (
            <LoadingBlock />
          )}
          <PanelFooter>
            <Button asChild variant="operational" className="w-full">
              <Link to="/decisoes">
                Ver todas no Centro de Decisões <ArrowRight />
              </Link>
            </Button>
          </PanelFooter>
        </Panel>

        <Panel flush>
          <PanelHeader title="Linha do tempo de hoje" icon={History} hint="do dado à ação" />
          {snapshot ? <Timeline events={snapshot.timeline} /> : <LoadingBlock />}
        </Panel>
      </div>
    </div>
  );
}
