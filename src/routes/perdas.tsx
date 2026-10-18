import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  Droplets,
  Gauge,
  History,
  Play,
  ScanSearch,
  TimerReset,
  Wrench,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  OpsMap,
  type LayerOption,
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
import { SensorGrid } from "@/components/aquagraph/sensors";
import {
  ConfidenceBar,
  InfoTip,
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
  StatusBadge,
  StoryBanner,
  Term,
} from "@/components/aquagraph/primitives";
import { StorySection } from "@/components/aquagraph/story";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useExecuteDecision, useLeakReplay, useLive, useLosses, useMapBase } from "@/lib/api";
import { num, readingsById, signed } from "@/lib/format";
import { pageHead } from "@/lib/route-head";
import { severityFromProbability } from "@/lib/severity";
import type { LeakEvidence, LeakReplayFrame, LeakReplayResponse } from "@/types/api";

export const Route = createFileRoute("/perdas")({
  head: pageHead(
    "Perdas e Vazamentos",
    "Detecção de vazamentos não visíveis por setor: vazão noturna, pressão e balanço hídrico em Ribeirão Preto.",
  ),
  component: LeaksPage,
});

const LAYERS: LayerOption[] = [
  { id: "sectors", label: "Setores (probabilidade)", on: true },
  { id: "leak", label: "Mapa de calor de vazamento", on: true },
  { id: "network", label: "Adutoras e rede principal", on: true },
  { id: "secondary", label: "Rede secundária (zoom)", on: true },
  { id: "sensors", label: "Sensores de vazão e pressão", on: true },
  { id: "reservoirs", label: "Reservatórios e poços", on: false },
];

const EVIDENCE_ICON: Record<LeakEvidence["id"], typeof Activity> = {
  mnf: TimerReset,
  pressure: Gauge,
  balance: Droplets,
  consumption: Activity,
  history: History,
};

const FRAME_MS = 650;

function LeaksPage() {
  const scenario = useScenario();
  const [selected, setSelected] = useState<string | null>(null);
  const losses = useLosses(selected);
  const live = useLive(scenario.rainMode, scenario.installed);
  const base = useMapBase();
  const execute = useExecuteDecision(scenario.rainMode, scenario.installed);

  const [replayParams, setReplayParams] = useState<{ sector: string | null; size: number | null }>({
    sector: null,
    size: null,
  });
  const replay = useLeakReplay(replayParams);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [simSector, setSimSector] = useState("29-F");
  const [simSize, setSimSize] = useState(10);

  const data = losses.data;
  const detail = data?.selected;
  const frames = useMemo(() => replay.data?.frames ?? [], [replay.data]);
  const playing = frameIndex !== null;
  const frame: LeakReplayFrame | undefined = playing ? frames[frameIndex] : undefined;

  const play = (params: { sector: string | null; size: number | null }) => {
    setReplayParams(params);
    if (params.sector) setSelected(params.sector);
    setFrameIndex(0);
  };

  // Avança um quadro por vez quando o replay está carregado. Efeito puro:
  // cada quadro agenda o próximo; o último anuncia o resultado.
  const result = replay.data;
  useEffect(() => {
    if (frameIndex === null || !result) return;
    if (frameIndex >= result.frames.length - 1) {
      announceReplay(result);
      const done = window.setTimeout(() => setFrameIndex(null), 1800);
      return () => window.clearTimeout(done);
    }
    const next = window.setTimeout(
      () => setFrameIndex((i) => (i === null ? null : i + 1)),
      FRAME_MS,
    );
    return () => window.clearTimeout(next);
  }, [frameIndex, result]);

  useDemoCue("leaks", () => play({ sector: null, size: null }));

  const readings = useMemo(() => readingsById(live.data?.sensors), [live.data]);

  const sectorStyles = useMemo(() => {
    const styles: Record<string, SectorStyle> = {};
    for (const sector of data?.sectors ?? []) {
      const animated =
        frame && replay.data?.sector === sector.id ? frame.probability : sector.leakProbability;
      styles[sector.id] = {
        level: severityFromProbability(animated),
        caption: `${animated}%`,
        detail: `Perda física ${num(sector.lossRate)}% · ${num(sector.lostM3h)} m³/h · pressão ${signed(sector.pressureDeviation)}%`,
      };
    }
    return styles;
  }, [data, frame, replay.data]);

  const heat = useMemo(() => {
    const points = (data?.sectors ?? [])
      .filter((s) => s.leakProbability >= 35 && s.id !== detail?.id)
      .map((s) => ({ lngLat: s.lngLat, weight: s.leakProbability / 130 }));
    const scale = frame
      ? frame.probability / Math.max(1, frames[frames.length - 1]?.probability ?? 1)
      : 1;
    for (const candidate of detail?.candidates ?? [])
      points.push({
        lngLat: candidate.lngLat,
        weight: Math.min(1, (0.35 + candidate.share / 40) * scale),
      });
    return points;
  }, [data, detail, frame, frames]);

  const highlight = useMemo(
    () =>
      (detail?.candidates ?? []).map((c, i) => ({
        id: c.id,
        level:
          i === 0 ? ("critical" as const) : i === 1 ? ("high" as const) : ("attention" as const),
      })),
    [detail],
  );

  const markers = useMemo<MapMarkerSpec[]>(() => {
    const top = detail?.candidates[0];
    if (!top || !detail) return [];
    return [
      {
        id: `cand-${top.id}`,
        lngLat: top.lngLat,
        level: detail.level,
        kind: "alert",
        label: `Trecho ${top.id}`,
        detail: `${top.share}% · ${top.street ?? ""}`,
        pulse: detail.level === "critical",
        tooltip: (
          <>
            <header>
              <strong>Trecho {top.id}</strong>
              <span>{top.street}</span>
            </header>
            <p>
              Trecho que melhor explica a queda de pressão nos sensores do setor {detail.id}: DN{" "}
              {top.diameter} · {top.material} · {top.year}.
            </p>
            <footer>
              <span className="map-tip-origin origin-modelo">Cálculo do modelo</span>
              <small>{top.share}% da probabilidade de localização</small>
            </footer>
          </>
        ),
      },
    ];
  }, [detail]);

  const focus = useMemo(() => {
    if (!detail || !base.data || selected === null) return null;
    const sector = base.data.sectors.find((s) => s.id === detail.id);
    return sector ? { lngLat: sector.centroid, zoom: 13.6, key: sector.id } : null;
  }, [detail, base.data, selected]);

  const sectorSensors = (live.data?.sensors ?? []).filter((s) => detail?.sensors.includes(s.id));
  const probability =
    frame && replay.data?.sector === detail?.id
      ? frame.probability
      : (detail?.leakProbability ?? 0);
  const lastFrame = frames[frames.length - 1];

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>
            {playing
              ? `Reconstrução · ${frame?.t ?? ""}`
              : "Telemetria ao vivo · 9 macromedidores · 12 sensores de pressão"}
          </LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Balanço hídrico das últimas 24 h · análise de vazão mínima noturna das últimas 14
            madrugadas
          </span>
        </div>
        <div className="toolbar-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={playing}>
                <Play />
                {playing ? `Simulando · ${probability}%` : "Simular evento"}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Cenários</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => play({ sector: null, size: null })}>
                Reproduzir a detecção do setor 14-B
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSimulateOpen(true)}>
                Simular novo vazamento…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setFrameIndex(null);
                  setReplayParams({ sector: null, size: null });
                }}
              >
                Voltar à situação atual
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <StoryBanner
        icon={ScanSearch}
        level={detail?.level ?? "info"}
        title={
          detail
            ? `Setor ${detail.id} · ${detail.name}: ${detail.leakProbability >= 60 ? "provável vazamento não visível" : detail.leakProbability >= 35 ? "sinal fraco em observação" : "sem anomalia relevante"}`
            : "Analisando setores…"
        }
        aside={
          <>
            <OriginBadge origin="simulado" label="Sensores simulados" />
            <OriginBadge origin="modelo" label="Detecção do modelo" />
          </>
        }
      >
        {detail
          ? detail.leakProbability >= 35
            ? `Vazão mínima noturna ${signed(((detail.mnf - detail.expectedMnf) / detail.expectedMnf) * 100)}% acima do esperado e pressão ${signed(detail.pressureDeviation)}% no sensor mais afetado${detail.onset ? `, desde ${detail.onset}` : ""}. ${detail.conclusion}`
            : detail.conclusion
          : "Carregando o balanço hídrico."}
      </StoryBanner>

      <KpiStrip>
        <KpiCard
          icon={Droplets}
          label="Perda física estimada"
          info="perdaFisica"
          origin="modelo"
          value={data ? `${num(data.city.lossRate)}%` : "—"}
          hint={
            data
              ? `${num(data.city.inflowM3day / 1000, 0)} mil m³ entraram · ${num(data.city.consumptionM3day / 1000, 0)} mil consumidos`
              : ""
          }
          tone="cyan"
          progress={data?.city.lossRate}
        />
        <KpiCard
          icon={Gauge}
          label="Volume perdido agora"
          info={{
            term: "Volume perdido agora",
            definition:
              "Soma do vazamento de fundo (que todo sistema tem) com os vazamentos ativos detectados, convertida para m³ por hora.",
          }}
          origin="modelo"
          value={data ? num(data.city.lostM3h, 0) : "—"}
          unit="m³/h"
          hint="vazamentos de fundo + eventos ativos"
          tone="warning"
        />
        <KpiCard
          icon={Activity}
          label="Setores em alerta"
          info="probabilidade"
          value={data ? String(data.city.alertSectors) : "—"}
          unit={`de ${data?.sectors.length ?? 9}`}
          hint="probabilidade de vazamento ≥ 35%"
          tone="critical"
          spark={data?.sectors.map((s) => s.leakProbability).sort((a, b) => a - b)}
          sparkKind="bars"
        />
        <KpiCard
          icon={TimerReset}
          label="Tempo até a detecção"
          info={{
            term: "Tempo até a detecção",
            definition:
              "Horas entre o início estimado do vazamento do setor 14-B e o momento em que o modelo passou de 80% de probabilidade. Sem telemetria, vazamentos não visíveis podem durar meses.",
          }}
          value={data ? `${data.city.detectionLeadHours}` : "—"}
          unit="h"
          hint="do início do vazamento ao alerta crítico"
          tone="success"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Probabilidade de vazamento por setor"
            info="probabilidade"
            hint="clique num setor para analisar"
            action={
              <>
                {detail && (
                  <StatusBadge level={severityFromProbability(probability)}>
                    {detail.id} · {probability}%
                  </StatusBadge>
                )}
                <LiveTag>{playing ? "simulação" : "ao vivo"}</LiveTag>
              </>
            }
          />
          {base.data ? (
            <OpsMap
              base={base.data}
              layers={LAYERS}
              sectorStyles={sectorStyles}
              selectedSector={detail?.id ?? null}
              onSelectSector={setSelected}
              readings={readings}
              heat={heat}
              highlightPipes={highlight}
              markers={markers}
              focus={focus}
              legend={{
                title: "Probabilidade de vazamento",
                gradient: ["#38bdf8", "#14b8a6", "#f59e0b", "#f97316", "#ef4444"],
                ticks: ["Baixa", "Média", "Alta"],
              }}
            />
          ) : (
            <LoadingBlock height={520} label="Carregando mapa…" />
          )}
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader title="Setores por probabilidade" icon={Activity} hint="últimas 24 h" />
            <ul className="rank-list">
              {(data?.sectors ?? []).map((sector) => (
                <li key={sector.id}>
                  <button
                    type="button"
                    className={sector.id === detail?.id ? "is-selected" : undefined}
                    onClick={() => setSelected(sector.id)}
                  >
                    <span className="rank-name">
                      <strong>{sector.id}</strong>
                      <small>{sector.name}</small>
                    </span>
                    <span className={`rank-bar level-${sector.level}`}>
                      <i style={{ width: `${sector.leakProbability}%` }} />
                    </span>
                    <b className={`level-${sector.level}`}>{sector.leakProbability}%</b>
                  </button>
                </li>
              ))}
            </ul>
            <PanelFooter>
              <p className="section-note">
                <Term explain="setor">Setores</Term> com entrada medida: a diferença entre o que
                entra e o que é consumido revela as perdas.
              </p>
            </PanelFooter>
          </Panel>
        </aside>
      </div>

      {/* 01 — Dados coletados */}
      <StorySection>
        <SectionHeading
          index={1}
          title="Dados coletados"
          description={
            detail
              ? `O que os sensores do setor ${detail.id} · ${detail.name} mediram nas últimas 24 h`
              : "Telemetria do setor selecionado"
          }
          aside={<OriginBadge origin="simulado" label="Sensores simulados" />}
        />
        {sectorSensors.length > 0 && <SensorGrid readings={sectorSensors} base={base.data} />}
        <div className="grid-2">
          <Panel>
            <PanelHeader
              title="Vazão de entrada × consumo"
              info="balanco"
              hint="24 h · a cada 30 min"
              action={
                <ChartLegend
                  items={[
                    { label: "Vazão medida", color: "var(--ag-cyan)" },
                    { label: "Esperada", color: "var(--ag-text-2)", dashed: true },
                    { label: "Consumo medido", color: "var(--ag-teal)" },
                  ]}
                />
              }
            />
            <PanelBody>
              {detail ? (
                <ChartFrame height={200}>
                  <ComposedChart data={detail.day} margin={CHART_MARGIN}>
                    <defs>
                      <linearGradient id="ag-cons-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ag-teal)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--ag-teal)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="time" interval={7} {...AXIS} />
                    <YAxis {...AXIS_Y} width={40} unit="" />
                    <Tooltip
                      content={
                        <AgTooltip
                          unit=" L/s"
                          caption="A distância entre vazão e consumo é a água perdida"
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="consumption"
                      name="Consumo medido"
                      stroke="var(--ag-teal)"
                      strokeWidth={1.4}
                      fill="url(#ag-cons-fill)"
                    />
                    <Line
                      type="monotone"
                      dataKey="expected"
                      name="Vazão esperada"
                      stroke="var(--ag-text-2)"
                      strokeDasharray="5 4"
                      strokeWidth={1.4}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="inflow"
                      name="Vazão medida"
                      stroke="var(--ag-cyan)"
                      strokeWidth={2.2}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={200} />
              )}
              <p className="section-note">
                Vazão no macromedidor da entrada do setor contra o consumo dos hidrômetros. A faixa
                entre as curvas é perda; quando a vazão medida descola da esperada, algo mudou na
                rede.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Vazão mínima noturna"
              info="mnf"
              hint="últimas 14 madrugadas"
              action={
                <ChartLegend
                  items={[
                    { label: "Medida (02h–04h)", color: "var(--ag-blue)" },
                    { label: "Esperada", color: "var(--ag-warning)", dashed: true },
                  ]}
                />
              }
            />
            <PanelBody>
              {detail ? (
                <ChartFrame height={200}>
                  <ComposedChart data={detail.nights} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="date" interval={1} {...AXIS} />
                    <YAxis
                      {...AXIS_Y}
                      width={40}
                      domain={["dataMin - 6", "dataMax + 4"]}
                      allowDecimals={false}
                      tickFormatter={(v: number) => num(v, 0)}
                    />
                    <Tooltip
                      content={
                        <AgTooltip
                          unit=" L/s"
                          caption="Menor vazão da madrugada: quase só perdas"
                        />
                      }
                      cursor={{ fill: "oklch(0.8276 0.1013 230.32 / 0.06)" }}
                    />
                    <Bar
                      dataKey="mnf"
                      name="Vazão mínima medida"
                      fill="var(--ag-blue)"
                      fillOpacity={0.55}
                      radius={[3, 3, 0, 0]}
                      barSize={14}
                    />
                    <Line
                      type="monotone"
                      dataKey="expected"
                      name="Esperada"
                      stroke="var(--ag-warning)"
                      strokeDasharray="5 4"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={200} />
              )}
              <p className="section-note">
                De madrugada quase ninguém usa água: uma barra que salta acima da linha tracejada e
                não volta é a assinatura de um vazamento novo.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </StorySection>

      {/* 02 — Riscos detectados */}
      <StorySection>
        <SectionHeading
          index={2}
          title="Riscos detectados"
          description="Por que o modelo acredita que há um vazamento — e onde procurar"
          aside={<OriginBadge origin="modelo" />}
        />
        <div className="grid-2">
          <Panel>
            <PanelHeader
              title="Por que o modelo gerou este alerta?"
              icon={BrainCircuit}
              info="probabilidade"
            />
            <PanelBody>
              {detail ? (
                <>
                  <div className="evidence-grid">
                    {detail.evidence.map((item) => {
                      const Icon = EVIDENCE_ICON[item.id];
                      return (
                        <div key={item.id} className={`evidence-card level-${item.level}`}>
                          <span className="evidence-card-icon">
                            <Icon />
                          </span>
                          <div className="evidence-card-main">
                            <span>
                              {item.label}
                              <InfoTip explain={{ term: item.label, definition: item.detail }} />
                            </span>
                            <strong>{item.reading}</strong>
                          </div>
                          <div className="evidence-card-weight">
                            <i>
                              <b style={{ width: `${item.weight}%` }} />
                            </i>
                            <small>peso {item.weight}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="ai-conclusion">
                    <BrainCircuit />
                    {detail.conclusion}
                  </p>
                  <ConfidenceBar value={probability} label="Probabilidade de vazamento" />
                </>
              ) : (
                <LoadingBlock height={260} />
              )}
            </PanelBody>
          </Panel>

          <div className="side-stack">
            <Panel flush>
              <PanelHeader
                title="Trechos mais prováveis"
                info="candidato"
                hint={detail ? `setor ${detail.id}` : ""}
              />
              {detail && detail.candidates.length > 0 ? (
                <ul className="pipe-list">
                  {detail.candidates.map((pipe, index) => (
                    <li key={pipe.id}>
                      <div className="pipe-static">
                        <span className="pipe-rank">{index + 1}</span>
                        <span className="pipe-info">
                          <strong>
                            Trecho {pipe.id}
                            {pipe.street ? ` · ${pipe.street}` : ""}
                          </strong>
                          <small>
                            DN {pipe.diameter} · {pipe.material} · {pipe.year} · {pipe.lengthM} m
                          </small>
                          <span className="pipe-bar">
                            <i style={{ width: `${Math.min(100, pipe.share * 2.5)}%` }} />
                          </span>
                        </span>
                        <b>{pipe.share}%</b>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-hint">
                  {detail
                    ? "Sem evidência suficiente para localizar trechos neste setor."
                    : "Carregando…"}
                </p>
              )}
            </Panel>

            <Panel>
              <PanelHeader
                title="Como a detecção evoluiu"
                icon={History}
                hint={
                  replay.data
                    ? replay.data.hypothetical
                      ? `simulação · ${num(replay.data.sizeLps)} L/s no ${replay.data.sector}`
                      : `setor ${replay.data.sector} · início ${replay.data.onset}`
                    : ""
                }
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={playing || !replay.data}
                    onClick={() => play(replayParams)}
                  >
                    <Play />
                    Reproduzir
                  </Button>
                }
              />
              <PanelBody>
                {frames.length > 0 ? (
                  <ChartFrame height={150}>
                    <LineChart data={frames} margin={CHART_MARGIN}>
                      <CartesianGrid {...GRID} />
                      <XAxis
                        dataKey="hoursFromOnset"
                        {...AXIS}
                        tickFormatter={(h: number) => `${h} h`}
                      />
                      <YAxis domain={[0, 100]} {...AXIS_Y} width={34} unit="%" />
                      <ReferenceLine y={80} stroke="var(--ag-critical)" strokeDasharray="4 4" />
                      <ReferenceLine
                        y={60}
                        stroke="var(--ag-high)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                      />
                      <Tooltip
                        content={
                          <AgTooltip
                            unit="%"
                            decimals={0}
                            caption="Horas desde o início do vazamento"
                          />
                        }
                        labelFormatter={(h: number) => `${h} h após o início`}
                      />
                      <Line
                        type="monotone"
                        dataKey="probability"
                        name="Probabilidade"
                        stroke="var(--ag-cyan)"
                        strokeWidth={2.2}
                        dot={false}
                      />
                      {frame && (
                        <ReferenceDot
                          x={frame.hoursFromOnset}
                          y={frame.probability}
                          r={5}
                          fill="var(--ag-cyan)"
                          stroke="var(--ag-bg-deep)"
                        />
                      )}
                    </LineChart>
                  </ChartFrame>
                ) : (
                  <LoadingBlock height={150} />
                )}
                <p className="section-note">
                  {frame?.note ??
                    (lastFrame
                      ? `${replay.data?.detectedAt ? `Alerta crítico ${replay.data.detectedAt}.` : "Ainda sem confirmação."} Pressão e balanço elevam o alerta em poucas horas; a madrugada seguinte confirma pela vazão mínima noturna.`
                      : "")}
                </p>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </StorySection>

      {/* 03 — Ação recomendada */}
      <StorySection>
        <SectionHeading
          index={3}
          title="Ação recomendada"
          description="O que fazer agora, por quem e em quanto tempo"
        />
        <Panel>
          <PanelHeader
            title="Ordem de serviço sugerida"
            icon={Wrench}
            action={
              data && (
                <StatusBadge
                  level={
                    data.action.priority === "Crítica"
                      ? "critical"
                      : data.action.priority === "Alta"
                        ? "high"
                        : "attention"
                  }
                >
                  Prioridade {data.action.priority}
                </StatusBadge>
              )
            }
          />
          <PanelBody>
            {data && detail ? (
              <div className="action-card">
                <div className="action-card-head">
                  <div>
                    <h3>{data.action.title}</h3>
                    <p>{data.action.rationale}</p>
                  </div>
                </div>
                <MetricGrid columns={4}>
                  <Metric label="Janela recomendada" value={data.action.window} />
                  <Metric label="Equipe sugerida" value={data.action.team} />
                  <Metric
                    label="Perda evitável"
                    value={`${num(Math.max(0, detail.inflow - detail.expectedInflow) * 3.6, 0)} m³/h`}
                    hint="excesso de vazão atual"
                  />
                  <Metric label="Confiança" value={`${detail.leakProbability}%`} info="confianca" />
                </MetricGrid>
              </div>
            ) : (
              <LoadingBlock />
            )}
          </PanelBody>
          <PanelFooter>
            <div className="footer-actions">
              <Button
                variant="operational"
                disabled={!data || (detail?.leakProbability ?? 0) < 35}
                onClick={() => setOrderOpen(true)}
              >
                Gerar ordem de serviço
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      </StorySection>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="order-dialog">
          <DialogHeader>
            <DialogTitle>Gerar ordem de serviço</DialogTitle>
            <DialogDescription>
              A ordem é registrada no servidor e aparece no Centro de Decisões e na linha do tempo.
            </DialogDescription>
          </DialogHeader>
          {data && detail && (
            <div className="order-grid">
              <div>
                <span>Serviço</span>
                <strong>{data.action.title}</strong>
              </div>
              <div>
                <span>Trecho prioritário</span>
                <strong>{detail.candidates[0]?.id ?? `Setor ${detail.id}`}</strong>
              </div>
              <div>
                <span>Prioridade</span>
                <strong className="text-critical">{data.action.priority}</strong>
              </div>
              <div>
                <span>Equipe</span>
                <strong>{data.action.team}</strong>
              </div>
              <div>
                <span>Janela</span>
                <strong>{data.action.window}</strong>
              </div>
              <div>
                <span>Evidência</span>
                <strong>{detail.leakProbability}% de probabilidade</strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="operational"
              disabled={execute.isPending || !data}
              onClick={() => {
                if (!data) return;
                execute.mutate(data.action.decisionId, {
                  onSuccess: ({ workOrder }) => {
                    setOrderOpen(false);
                    toast.success("Ordem de serviço criada com sucesso.", {
                      description: `${workOrder.id} · ${workOrder.team} · prazo ${workOrder.deadline}`,
                    });
                  },
                  onError: (error) =>
                    toast.error("Não foi possível criar a ordem.", { description: error.message }),
                });
              }}
            >
              {execute.isPending ? "Registrando…" : "Confirmar ordem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="simulator-dialog">
          <DialogHeader>
            <DialogTitle>Simular novo vazamento</DialogTitle>
            <DialogDescription>
              O motor injeta um vazamento num trecho antigo do setor e simula as próximas 30 h de
              telemetria. Veja quando — e se — o modelo o detecta.
            </DialogDescription>
          </DialogHeader>
          <div className="sim-form">
            <div className="sim-field">
              <div className="sim-field-head">
                <span>Setor</span>
              </div>
              <Select value={simSector} onValueChange={setSimSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(data?.sectors ?? []).map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.id} · {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sim-field">
              <div className="sim-field-head">
                <span>Vazão do vazamento</span>
                <strong>{simSize} L/s</strong>
              </div>
              <Slider
                value={[simSize]}
                min={2}
                max={25}
                step={1}
                onValueChange={(values) => setSimSize(values[0] ?? 10)}
              />
              <small>
                Um vazamento de {simSize} L/s perde {num(simSize * 86.4, 0)} m³ por dia —{" "}
                {num((simSize * 86.4) / 0.2 / 1000, 1)} mil pessoas abastecidas.
              </small>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimulateOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="operational"
              onClick={() => {
                setSimulateOpen(false);
                play({ sector: simSector, size: simSize });
              }}
            >
              Executar simulação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function announceReplay(result: LeakReplayResponse) {
  if (!result.hypothetical) {
    toast.warning("Anomalia hidráulica detectada.", {
      description: `Setor ${result.sector} — padrão consistente com perda física desde ${result.onset}.`,
    });
    return;
  }
  const size = num(result.sizeLps);
  if (result.detectedAt) {
    toast.warning(
      `Vazamento simulado de ${size} L/s no setor ${result.sector} detectado ${result.detectedAt}.`,
      {
        description: "A madrugada seguinte ao início do evento foi decisiva.",
      },
    );
  } else {
    toast.info(
      `Vazamento simulado de ${size} L/s no setor ${result.sector} ainda não confirmado em 30 h.`,
      {
        description:
          "Setor com pouca telemetria: veja em Active Sensing onde instalar o próximo sensor.",
      },
    );
  }
}
