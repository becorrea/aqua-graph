import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  Info,
  RadioTower,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  OpsMap,
  type LayerOption,
  type MapFieldSpec,
  type MapLayerKey,
  type MapMarkerSpec,
  type SectorStyle,
} from "@/components/map/OpsMap";
import {
  AgTooltip,
  AXIS,
  AXIS_Y,
  CHART_MARGIN,
  ChartFrame,
  ChartLegend,
  GRID,
} from "@/components/aquagraph/charts";
import { useDemoCue } from "@/components/aquagraph/DemoMode";
import { useScenario } from "@/components/aquagraph/ScenarioContext";
import { SensorInventory } from "@/components/aquagraph/sensors";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  LoadingBlock,
  Metric,
  MetricGrid,
  OriginBadge,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionHeading,
  SegmentedControl,
  StatusBadge,
  StoryBanner,
  SubTitle,
  Term,
} from "@/components/aquagraph/primitives";
import { StorySection } from "@/components/aquagraph/story";
import { Button } from "@/components/ui/button";
import { useLive, useMapBase, useSensing } from "@/lib/api";
import { num, readingsById, signed } from "@/lib/format";
import { pageHead } from "@/lib/route-head";
import type { Severity } from "@/types";

export const Route = createFileRoute("/active-sensing")({
  head: pageHead(
    "Active Sensing",
    "Onde um novo sensor reduz mais a incerteza do modelo da rede de Ribeirão Preto — e quanto ele vale.",
  ),
  component: ActiveSensingPage,
});

const VIEWS = [
  { id: "coverage", label: "Cobertura atual" },
  { id: "uncertainty", label: "Incerteza" },
  { id: "recommendation", label: "Recomendação IA" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const LAYERS: LayerOption[] = [
  { id: "sensors", label: "Sensores de rede", on: true },
  { id: "network", label: "Adutoras e rede principal", on: true },
  { id: "sectors", label: "Setores (incerteza)", on: true },
  { id: "plan", label: "Locais recomendados", on: true },
];

const VIEW_LAYERS: Record<View, Partial<Record<MapLayerKey, boolean>>> = {
  coverage: { coverage: true, uncertainty: false },
  uncertainty: { coverage: false, uncertainty: true },
  recommendation: { coverage: false, uncertainty: true, plan: true },
};

const uncertaintyLevel = (value: number): Severity =>
  value >= 60 ? "critical" : value >= 45 ? "high" : value >= 30 ? "attention" : "normal";

function ActiveSensingPage() {
  const scenario = useScenario();
  const [view, setView] = useState<View>("recommendation");
  const sensing = useSensing(scenario.installed);
  const live = useLive(scenario.rainMode, scenario.installed);
  const base = useMapBase();
  const data = sensing.data;
  const installed = scenario.installed;
  const next = data?.plan[installed] ?? null;
  const planSize = data?.plan.length ?? 3;

  // Não depende de `data`: a deixa do Modo Demo pode chegar antes da resposta.
  const install = () => {
    if (installed >= planSize) return;
    const candidate = data?.plan[installed];
    scenario.setInstalled(installed + 1);
    setView("recommendation");
    if (candidate) {
      toast.success(
        `Instalação simulada de ${candidate.id}: +${num(candidate.coverageGain)} p.p. de cobertura.`,
        {
          description: `${candidate.street ?? "Rede principal"} · setor ${candidate.sector} · incerteza −${num(candidate.uncertaintyDrop)} p.p.`,
        },
      );
    }
  };

  useDemoCue("sensing", () => {
    if (scenario.installed === 0) install();
  });

  const readings = useMemo(() => readingsById(live.data?.sensors), [live.data]);

  const fields = useMemo<MapFieldSpec[]>(() => {
    if (!data) return [];
    return [
      {
        id: "coverage",
        grid: data.coverageField,
        ramp: "coverage",
        describe: (v) => `Cobertura do modelo: ${Math.round(v * 100)}%`,
      },
      {
        id: "uncertainty",
        grid: data.uncertaintyField,
        ramp: "uncertainty",
        describe: (v) => `Incerteza do modelo: ${Math.round(v * 100)}%`,
      },
    ];
  }, [data]);

  const sectorStyles = useMemo(() => {
    const styles: Record<string, SectorStyle> = {};
    for (const sector of data?.bySector ?? []) {
      styles[sector.id] = {
        level: uncertaintyLevel(sector.uncertainty),
        caption: `${Math.round(sector.uncertainty)}%`,
        detail: `Incerteza ${num(sector.uncertainty)}% · cobertura ${num(sector.coverage)}% · ${sector.sensors} sensor(es)`,
      };
    }
    return styles;
  }, [data]);

  const markers = useMemo<MapMarkerSpec[]>(
    () =>
      (data?.plan ?? []).map((candidate, index) => {
        const done = index < installed;
        return {
          id: candidate.id,
          lngLat: candidate.lngLat,
          level: done
            ? ("normal" as const)
            : index === installed
              ? ("attention" as const)
              : ("info" as const),
          kind: done ? ("installed" as const) : ("recommendation" as const),
          label: done ? `${candidate.id} instalado` : candidate.id,
          detail: `+${num(candidate.coverageGain)} p.p. · setor ${candidate.sector}`,
          pulse: index === installed,
          layer: "plan" as const,
          tooltip: (
            <>
              <header>
                <strong>
                  {candidate.id} ·{" "}
                  {done ? "instalação simulada" : `recomendação nº ${candidate.rank}`}
                </strong>
                <span>{candidate.street ?? "Rede principal"}</span>
              </header>
              <div className="map-tip-reading">
                <b className="level-normal">
                  +{num(candidate.coverageGain)} <em>p.p. de cobertura</em>
                </b>
                <small>incerteza −{num(candidate.uncertaintyDrop)} p.p.</small>
              </div>
              <p>
                <span>Tipo:</span> sensor de pressão + vazão
              </p>
              <footer>
                <span className="map-tip-origin origin-modelo">Cálculo do modelo</span>
                <small>setor {candidate.sector}</small>
              </footer>
            </>
          ),
        };
      }),
    [data, installed],
  );

  const coverageGain = data ? data.current.coverage - data.before.coverage : 0;
  const uncertaintyDrop = data ? data.before.uncertainty - data.current.uncertainty : 0;
  const blindSpots = [...(data?.bySector ?? [])].sort((a, b) => b.uncertainty - a.uncertainty);

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-explainer">
            <Info />O AquaGraph calcula onde um novo sensor geraria o maior ganho de informação para
            o modelo.
          </span>
        </div>
        <div className="toolbar-right">
          <SegmentedControl options={VIEWS} value={view} onChange={setView} />
          {installed > 0 && (
            <Button variant="outline" size="sm" onClick={() => scenario.setInstalled(0)}>
              <RotateCcw />
              Reverter
            </Button>
          )}
          <Button
            variant="operational"
            size="sm"
            onClick={install}
            disabled={!data || installed >= planSize}
          >
            <Sparkles />
            {installed >= planSize
              ? "Plano instalado"
              : `Simular instalação${next ? ` · ${next.id}` : ""}`}
          </Button>
        </div>
      </div>

      <StoryBanner
        icon={ScanSearch}
        level={data && data.current.uncertainty > 35 ? "attention" : "normal"}
        title={
          data
            ? `${data.sensors} sensores de rede explicam ${num(data.current.coverage, 0)}% da rede`
            : "Calculando a incerteza da rede…"
        }
        aside={<OriginBadge origin="modelo" label="Processo gaussiano" />}
      >
        {data
          ? `As maiores lacunas estão em ${blindSpots
              .slice(0, 2)
              .map((s) => `${s.id} · ${s.name}`)
              .join(
                " e ",
              )}. ${next ? `Instalar ${next.id} na ${next.street ?? "rede principal"} aumenta a cobertura em ${num(next.coverageGain)} p.p. — o maior ganho entre todos os locais candidatos.` : "O plano de expansão recomendado já está instalado nesta simulação."}`
          : "Cada sensor reduz a incerteza do modelo no seu entorno; o objetivo é colocar o próximo onde ela é maior e mais importa."}
      </StoryBanner>

      <KpiStrip>
        <KpiCard
          icon={ScanSearch}
          label="Cobertura informacional"
          info="cobertura"
          origin="modelo"
          value={data ? `${num(data.current.coverage, 0)}%` : "—"}
          delta={installed > 0 ? `${signed(coverageGain)} p.p.` : undefined}
          deltaTone="positive"
          hint="rede com incerteza abaixo de 50%"
          tone="cyan"
          progress={data?.current.coverage}
        />
        <KpiCard
          icon={TriangleAlert}
          label="Incerteza do modelo"
          info="incerteza"
          origin="modelo"
          value={data ? `${num(data.current.uncertainty, 0)}%` : "—"}
          delta={installed > 0 ? `−${num(uncertaintyDrop)} p.p.` : undefined}
          deltaTone="positive"
          hint="variância média do estado estimado"
          tone={data && data.current.uncertainty > 35 ? "warning" : "success"}
          progress={data?.current.uncertainty}
        />
        <KpiCard
          icon={RadioTower}
          label="Sensores de rede"
          info={{
            term: "Sensores de rede",
            definition:
              "Macromedidores de vazão e sensores de pressão — os que observam a rede de distribuição. Os de nível, chuva e córrego servem aos módulos de seca e enchentes.",
          }}
          origin="simulado"
          value={data ? String(data.sensors) : "—"}
          delta={installed > 0 ? `+${installed} simulado${installed > 1 ? "s" : ""}` : undefined}
          deltaTone="positive"
          hint="vazão + pressão"
          tone="blue"
        />
        <KpiCard
          icon={Target}
          label="Capacidade de detecção"
          info="deteccao"
          origin="modelo"
          value={data ? `${num(data.current.detection, 0)}%` : "—"}
          delta={
            installed > 0 && data
              ? `+${num(((data.current.detection - data.before.detection) / data.before.detection) * 100, 0)}% relativo`
              : undefined
          }
          deltaTone="positive"
          hint="chance média de perceber um vazamento"
          tone="success"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title={
              view === "coverage"
                ? "Cobertura informacional"
                : view === "uncertainty"
                  ? "Incerteza do modelo"
                  : "Onde instalar o próximo sensor"
            }
            info={
              view === "coverage" ? "cobertura" : view === "uncertainty" ? "incerteza" : "ganho"
            }
            hint={
              data
                ? `${data.sensors} sensores · ${num(data.method.lengthScale / 1000, 1)} km de correlação`
                : ""
            }
            action={
              <LiveTag>
                {installed > 0 ? `${installed} instalação(ões) simulada(s)` : "modelo recalculado"}
              </LiveTag>
            }
          />
          {base.data ? (
            <OpsMap
              base={base.data}
              layers={LAYERS}
              forceLayers={VIEW_LAYERS[view]}
              readings={readings}
              sectorStyles={sectorStyles}
              fields={fields}
              markers={markers}
              legend={
                view === "coverage"
                  ? {
                      title: "Cobertura do modelo",
                      gradient: ["rgba(239,68,68,0.15)", "#f59e0b", "#14b8a6", "#22d3ee"],
                      ticks: ["Baixa", "Alta"],
                    }
                  : {
                      title: "Incerteza do modelo",
                      gradient: [
                        "rgba(34,211,238,0.15)",
                        "#14b8a6",
                        "#f59e0b",
                        "#f97316",
                        "#ef4444",
                      ],
                      ticks: ["Baixa", "Alta"],
                    }
              }
            />
          ) : (
            <LoadingBlock height={520} label="Carregando mapa…" />
          )}
        </Panel>

        <aside className="side-stack">
          <Panel>
            <PanelHeader
              title={next ? `Recomendação ${next.id}` : "Plano concluído"}
              icon={Sparkles}
              action={
                next && (
                  <StatusBadge level={next.priority === "Alta" ? "high" : "attention"}>
                    Prioridade {next.priority}
                  </StatusBadge>
                )
              }
            />
            <PanelBody>
              {next ? (
                <>
                  <div className="recommendation-head">
                    <span>Local</span>
                    <strong>{next.street ?? "Rede principal"}</strong>
                    <span>Setor</span>
                    <strong>
                      {next.sector} · {base.data?.sectors.find((s) => s.id === next.sector)?.name}
                    </strong>
                    <span>Tipo</span>
                    <strong>Pressão + vazão</strong>
                  </div>
                  <SubTitle>Ganho estimado</SubTitle>
                  <MetricGrid columns={2}>
                    <Metric
                      label="Cobertura"
                      value={`+${num(next.coverageGain)} p.p.`}
                      tone="cyan"
                      info="cobertura"
                    />
                    <Metric
                      label="Incerteza"
                      value={`−${num(next.uncertaintyDrop)} p.p.`}
                      tone="success"
                      info="incerteza"
                    />
                    <Metric
                      label="Setores beneficiados"
                      value={
                        next.sectorsBenefited.length
                          ? next.sectorsBenefited.join(" · ")
                          : (next.sector ?? "—")
                      }
                    />
                    <Metric
                      label="Ranking"
                      value={`${next.rank}º de ${data?.plan.length ?? 3}`}
                      hint="seleção gulosa"
                    />
                  </MetricGrid>
                </>
              ) : (
                <p className="section-note">
                  Os três sensores do plano foram instalados nesta simulação. Reverta para comparar
                  com a situação atual.
                </p>
              )}
            </PanelBody>
            <PanelFooter>
              <Button
                variant={next ? "operational" : "outline"}
                className="w-full"
                onClick={next ? install : () => scenario.setInstalled(0)}
              >
                {next ? `Simular instalação de ${next.id}` : "Reverter simulação"}
              </Button>
            </PanelFooter>
          </Panel>
        </aside>
      </div>

      {/* 01 — Dados coletados */}
      <StorySection>
        <SectionHeading
          index={1}
          title="Dados coletados"
          description="A rede de monitoramento inteira: o que cada sensor mede, para que serve e o que está lendo agora"
          aside={
            <>
              <OriginBadge origin="simulado" label="Leituras simuladas" />
              <OriginBadge origin="real" label="Chuva real" />
            </>
          }
        />
        <Panel flush className="table-scroll">
          {live.data ? (
            <SensorInventory readings={live.data.sensors} base={base.data} />
          ) : (
            <LoadingBlock height={200} />
          )}
        </Panel>
      </StorySection>

      {/* 02 — Pontos cegos */}
      <StorySection>
        <SectionHeading
          index={2}
          title="Pontos cegos"
          description="Onde o modelo enxerga menos — e por isso detecta vazamentos mais tarde"
          aside={<OriginBadge origin="modelo" />}
        />
        <div className="grid-2">
          <Panel flush>
            <PanelHeader title="Incerteza por setor" info="incerteza" hint="maior → menor" />
            <ul className="rank-list">
              {blindSpots.map((sector) => (
                <li key={sector.id}>
                  <div className="rank-static">
                    <span className="rank-name">
                      <strong>{sector.id}</strong>
                      <small>
                        {sector.name} · {sector.sensors} sensor(es)
                      </small>
                    </span>
                    <span className={`rank-bar level-${uncertaintyLevel(sector.uncertainty)}`}>
                      <i style={{ width: `${sector.uncertainty}%` }} />
                    </span>
                    <b className={`level-${uncertaintyLevel(sector.uncertainty)}`}>
                      {num(sector.uncertainty, 0)}%
                    </b>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel flush>
            <PanelHeader
              title={`Por que ${data?.plan[0]?.id ?? "este local"}?`}
              icon={BrainCircuit}
              info="gp"
              hint="fatores do ganho de informação"
            />
            <ul className="rationale-list">
              {(data?.rationale ?? []).map((item) => (
                <li key={item.title}>
                  <div className="rationale-main">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <div className="rationale-weight">
                    <i style={{ width: `${item.weight}%` }} />
                    <b>{item.weight}</b>
                  </div>
                </li>
              ))}
            </ul>
            <PanelFooter>
              <p className="section-note">
                Perto de um sensor de pressão, um vazamento aparece em horas; longe deles, só a{" "}
                <Term explain="mnf">vazão mínima noturna</Term> denuncia o problema, às vezes dias
                depois. Simule um vazamento no setor mais incerto em Perdas e Vazamentos e compare.
              </p>
            </PanelFooter>
          </Panel>
        </div>
      </StorySection>

      {/* 03 — Plano de expansão */}
      <StorySection>
        <SectionHeading
          index={3}
          title="Plano de expansão"
          description="Retornos decrescentes: cada sensor novo rende um pouco menos que o anterior"
        />
        <div className="grid-2">
          <Panel>
            <PanelHeader
              title="Cobertura × número de sensores novos"
              info="ganho"
              action={
                <ChartLegend
                  items={[
                    { label: "Cobertura", color: "var(--ag-cyan)" },
                    { label: "Incerteza", color: "var(--ag-warning)" },
                  ]}
                />
              }
            />
            <PanelBody>
              {data ? (
                <ChartFrame height={210}>
                  <LineChart data={data.curve} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      dataKey="sensors"
                      {...AXIS}
                      tickFormatter={(n: number) => (n === 0 ? "hoje" : `+${n}`)}
                    />
                    <YAxis domain={[0, 100]} unit="%" {...AXIS_Y} width={42} />
                    <Tooltip
                      content={<AgTooltip unit="%" decimals={1} />}
                      labelFormatter={(n: number) =>
                        n === 0 ? "Rede atual" : `Com ${n} sensor(es) novo(s)`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="coverage"
                      name="Cobertura"
                      stroke="var(--ag-cyan)"
                      strokeWidth={2.2}
                      dot={{ r: 3, fill: "var(--ag-cyan)", strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="uncertainty"
                      name="Incerteza"
                      stroke="var(--ag-warning)"
                      strokeWidth={1.8}
                      dot={{ r: 2.5, fill: "var(--ag-warning)", strokeWidth: 0 }}
                    />
                    {data.curve[installed] && (
                      <ReferenceDot
                        x={installed}
                        y={data.curve[installed]?.coverage ?? 0}
                        r={6}
                        fill="var(--ag-cyan)"
                        stroke="var(--ag-bg-deep)"
                      />
                    )}
                  </LineChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={210} />
              )}
              <p className="section-note">
                Os três primeiros sensores levam a cobertura de {num(data?.before.coverage ?? 0, 0)}
                % para {num(data?.after.coverage ?? 0, 0)}%; os cinco seguintes somam menos que
                isso.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Antes / depois do plano" hint={`${planSize} sensores`} />
            <PanelBody>
              {data ? (
                <>
                  <div className="compare">
                    <div className="compare-card">
                      <span className="compare-tag">Hoje</span>
                      <div className="compare-metric">
                        <small>Cobertura</small>
                        <strong>{num(data.before.coverage, 0)}%</strong>
                        <i>
                          <b
                            className="tone-warning"
                            style={{ width: `${data.before.coverage}%` }}
                          />
                        </i>
                      </div>
                      <div className="compare-metric">
                        <small>Incerteza</small>
                        <strong>{num(data.before.uncertainty, 0)}%</strong>
                        <i>
                          <b
                            className="tone-critical"
                            style={{ width: `${data.before.uncertainty}%` }}
                          />
                        </i>
                      </div>
                    </div>
                    <span className="compare-arrow">
                      <ArrowRight />
                    </span>
                    <div className={`compare-card ${installed >= planSize ? "is-active" : ""}`}>
                      <span className="compare-tag is-after">Com o plano</span>
                      <div className="compare-metric">
                        <small>Cobertura</small>
                        <strong>{num(data.after.coverage, 0)}%</strong>
                        <i>
                          <b className="tone-cyan" style={{ width: `${data.after.coverage}%` }} />
                        </i>
                      </div>
                      <div className="compare-metric">
                        <small>Incerteza</small>
                        <strong>{num(data.after.uncertainty, 0)}%</strong>
                        <i>
                          <b
                            className="tone-success"
                            style={{ width: `${data.after.uncertainty}%` }}
                          />
                        </i>
                      </div>
                    </div>
                  </div>
                  <table className="data-table is-compact">
                    <thead>
                      <tr>
                        <th>Sensor</th>
                        <th>Local</th>
                        <th className="is-numeric">Cobertura</th>
                        <th className="is-numeric">Incerteza</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.plan.map((candidate, index) => (
                        <tr
                          key={candidate.id}
                          className={index === installed ? "is-highlight" : undefined}
                        >
                          <td>
                            <strong>{candidate.id}</strong>
                          </td>
                          <td>
                            {candidate.street ?? "Rede principal"}
                            <small>setor {candidate.sector}</small>
                          </td>
                          <td className="is-numeric text-success">
                            +{num(candidate.coverageGain)} p.p.
                          </td>
                          <td className="is-numeric text-cyan">
                            −{num(candidate.uncertaintyDrop)} p.p.
                          </td>
                          <td>
                            <StatusBadge
                              level={
                                index < installed
                                  ? "normal"
                                  : index === installed
                                    ? "attention"
                                    : "info"
                              }
                              subtle
                            >
                              {index < installed
                                ? "Simulado"
                                : index === installed
                                  ? "Próximo"
                                  : "Planejado"}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <LoadingBlock height={210} />
              )}
            </PanelBody>
          </Panel>
        </div>
      </StorySection>
    </div>
  );
}
