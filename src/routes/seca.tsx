import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CloudSun,
  Droplets,
  Factory,
  FlaskConical,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  ThermometerSun,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { OpsMap, type LayerOption, type SectorStyle } from "@/components/map/OpsMap";
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
import { ActionList } from "@/components/aquagraph/lists";
import { useScenario } from "@/components/aquagraph/ScenarioContext";
import { SensorGrid } from "@/components/aquagraph/sensors";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useDecisions, useDrought, useLive, useMapBase } from "@/lib/api";
import { daysLabel, num, readingsById, signed } from "@/lib/format";
import { pageHead } from "@/lib/route-head";
import type { DroughtParams } from "@/types/api";

export const Route = createFileRoute("/seca")({
  head: pageHead(
    "Seca e Resiliência",
    "Margem de produção dos poços, reservação e teste de estresse do abastecimento de Ribeirão Preto.",
  ),
  component: DroughtPage,
});

const SYSTEMS = [
  { id: "norte", label: "Sistema Norte" },
  { id: "central", label: "Sistema Central" },
  { id: "sul", label: "Sistema Sul" },
] as const;

const RAIN_OPTIONS = [
  { id: "normal", label: "Previsão real" },
  { id: "abaixo", label: "Abaixo da média" },
  { id: "critica", label: "Estiagem crítica" },
] as const;

const MAP_LAYERS: LayerOption[] = [
  { id: "sectors", label: "Sistemas e setores", on: true },
  { id: "network", label: "Adutoras", on: true },
  { id: "reservoirs", label: "Reservatórios e poços", on: true },
];

const DEFAULT_DRAFT: DroughtParams = {
  pressureReduction: 15,
  transfer: true,
  campaign: false,
  rain: "abaixo",
};

function DroughtPage() {
  const scenario = useScenario();
  const [system, setSystem] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [custom, setCustom] = useState<DroughtParams | null>(null);
  const [draft, setDraft] = useState<DroughtParams>(DEFAULT_DRAFT);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [preview, setPreview] = useState<DroughtParams | null>(null);
  const drought = useDrought(system, custom ? null : scenarioId, custom);
  const simulation = useDrought(system, null, preview);
  const live = useLive(scenario.rainMode, scenario.installed);
  const base = useMapBase();
  const decisions = useDecisions(scenario.rainMode, scenario.installed);

  const data = drought.data;
  const focus = data?.systems.find((s) => s.id === data.focus);

  useDemoCue("drought", () => {
    setCustom(null);
    setScenarioId("combinado");
  });

  const levelSensors = (live.data?.sensors ?? []).filter((s) => s.type === "level");
  // Dados derivados memorizados: arrastar o slider do simulador re-renderiza a
  // página, e um array novo faria os gráficos recalcularem e re-animarem.
  const balanceChart = useMemo(
    () => (data?.daily ?? []).map((d) => ({ ...d, total: d.demand + d.losses })),
    [data],
  );
  const climateChart = useMemo(() => (data?.daily ?? []).filter((d) => d.day <= 15), [data]);
  const readings = useMemo(() => readingsById(live.data?.sensors), [live.data]);

  const sectorStyles = useMemo(() => {
    const styles: Record<string, SectorStyle> = {};
    for (const s of data?.systems ?? []) {
      for (const sector of s.sectors) {
        styles[sector] = {
          level: s.severity,
          caption: `${Math.round(s.level)}%`,
          detail: `${s.name} · reservação ${num(s.level)}% · margem ${signed(s.margin)}%`,
        };
      }
    }
    return styles;
  }, [data]);

  const selectedScenario = data?.scenarios.find((s) => s.id === data.selectedScenario);
  const scenarioLabel = custom
    ? "Cenário personalizado"
    : selectedScenario && selectedScenario.id !== "atual"
      ? `Estresse + ${selectedScenario.name.toLowerCase()}`
      : null;
  const droughtActions = (decisions.data?.decisions ?? []).filter((d) => d.module === "seca");

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>
            {data
              ? `Clima real (${data.weatherSource === "open-meteo" ? "Open-Meteo" : "climatologia"}): ${num(data.climate.rain60, 0)} mm de chuva em 60 dias · máxima média de ${num(data.climate.tmax7)} °C na última semana`
              : "Carregando clima e produção…"}
          </LiveTag>
        </div>
        <div className="toolbar-right">
          <SegmentedControl
            options={SYSTEMS}
            value={(system ?? data?.focus ?? "sul") as (typeof SYSTEMS)[number]["id"]}
            onChange={(id) => {
              setSystem(id);
              setCustom(null);
            }}
            size="sm"
          />
          <Button variant="outline" size="sm" onClick={() => setSimulatorOpen(true)}>
            <SlidersHorizontal />
            Simular novo cenário
          </Button>
        </div>
      </div>

      <StoryBanner
        icon={Droplets}
        level={focus?.severity ?? "info"}
        title={
          focus
            ? `${focus.name}: reservação em ${num(focus.level, 0)}% e ${focus.wellsOffline} poço(s) em manutenção`
            : "Calculando o balanço do abastecimento…"
        }
        aside={
          <>
            <OriginBadge origin="real" label="Clima real" />
            <OriginBadge origin="modelo" label="Projeção" />
          </>
        }
      >
        {focus && data
          ? focus.daysToCritical !== null
            ? `Mantida a tendência, o sistema entra em zona crítica em ${focus.daysToCritical} dias. Sob estresse climático, em ${daysLabel(focus.adverseDays)}.`
            : `Com o clima previsto (${num(data.climate.rainNext16, 0)} mm nos próximos 16 dias), não há criticidade no horizonte de ${data.horizonDays} dias. Mas o sistema opera no limite: numa onda de calor com outro poço parado, chegaria à zona crítica em ${daysLabel(focus.adverseDays)}.`
          : "A água de Ribeirão Preto vem de poços do Aquífero Guarani: o risco de falta d'água depende da margem entre produção e consumo."}
      </StoryBanner>

      <KpiStrip>
        <KpiCard
          icon={Droplets}
          label="Reservação média"
          info="reservacao"
          origin="simulado"
          value={data ? `${num(data.city.level, 0)}%` : "—"}
          hint="nível médio diário dos 3 sistemas"
          tone="cyan"
          progress={data?.city.level}
        />
        <KpiCard
          icon={CalendarClock}
          label="Dias até criticidade"
          info={{
            term: "Dias até criticidade",
            definition:
              "Quantos dias até a reservação média do sistema mais exposto cair abaixo de 25% — o ponto em que bairros altos começam a ter falta d'água.",
          }}
          origin="modelo"
          value={
            focus
              ? focus.daysToCritical === null
                ? `> ${data?.horizonDays ?? 150}`
                : String(focus.daysToCritical)
              : "—"
          }
          unit="dias"
          delta={focus ? `estresse: ${daysLabel(focus.adverseDays)}` : undefined}
          deltaTone="negative"
          hint={focus ? `${focus.name} · tendência atual` : ""}
          tone={focus?.daysToCritical !== null ? "critical" : "warning"}
        />
        <KpiCard
          icon={Factory}
          label="Margem de produção"
          info="margem"
          origin="modelo"
          value={focus ? `${signed(focus.margin)}%` : "—"}
          hint={
            data
              ? `poços ${num(data.city.productionLps, 0)} L/s · consumo ${num(data.city.demandLps, 0)} L/s`
              : ""
          }
          tone={focus && focus.margin < 0 ? "critical" : "teal"}
          spark={data?.daily
            .filter((d) => d.observed)
            .slice(-21)
            .map((d) => d.production - d.demand - d.losses)}
        />
        <KpiCard
          icon={ThermometerSun}
          label="Calor e chuva"
          info="aquifero"
          origin="real"
          value={data ? `${num(data.climate.tmax7)}°` : "—"}
          unit="C máx."
          hint={
            data
              ? `${num(data.climate.rain60, 0)} mm em 60 dias (normal ${num(data.climate.normal60, 0)} mm)`
              : ""
          }
          tone="warning"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel>
          <PanelHeader
            title={`Reservação do ${focus?.name ?? "sistema"}`}
            info="reservacao"
            hint="90 dias observados · 150 dias projetados"
            action={
              <ChartLegend
                items={[
                  { label: "Observado", color: "var(--ag-cyan)" },
                  { label: "Tendência", color: "var(--ag-blue)", dashed: true },
                  { label: "Estresse", color: "var(--ag-high)", dashed: true },
                  ...(scenarioLabel ? [{ label: scenarioLabel, color: "var(--ag-success)" }] : []),
                ]}
              />
            }
          />
          <PanelBody>
            {data ? (
              <ChartFrame height={300}>
                <LineChart data={data.series} margin={CHART_MARGIN}>
                  <CartesianGrid {...GRID} />
                  <ReferenceArea
                    y1={0}
                    y2={data.criticalLevel}
                    fill="var(--ag-critical)"
                    fillOpacity={0.1}
                    stroke="var(--ag-critical)"
                    strokeOpacity={0.25}
                    strokeDasharray="4 4"
                    label={{
                      value: "Zona crítica (< 25%)",
                      position: "insideBottomRight",
                      fill: "var(--ag-critical)",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    x={0}
                    stroke="var(--ag-text-2)"
                    strokeDasharray="3 3"
                    label={{
                      value: "Hoje",
                      position: "insideTopLeft",
                      fill: "var(--ag-text-2)",
                      fontSize: 10,
                    }}
                  />
                  <XAxis
                    dataKey="day"
                    type="number"
                    domain={[-90, 150]}
                    ticks={[-90, -60, -30, 0, 30, 60, 90, 120, 150]}
                    tickFormatter={(d: number) => (d === 0 ? "hoje" : `${d > 0 ? "+" : ""}${d} d`)}
                    {...AXIS}
                  />
                  <YAxis domain={[0, 100]} unit="%" {...AXIS_Y} width={44} />
                  <Tooltip
                    content={
                      <AgTooltip unit="%" decimals={0} caption="Nível médio diário da reservação" />
                    }
                    labelFormatter={(d: number) =>
                      d === 0 ? "Hoje" : d < 0 ? `${-d} dias atrás` : `daqui a ${d} dias`
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="observed"
                    name="Observado"
                    stroke="var(--ag-cyan)"
                    strokeWidth={2.4}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="base"
                    name="Tendência"
                    stroke="var(--ag-blue)"
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="adverse"
                    name="Estresse"
                    stroke="var(--ag-high)"
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                  />
                  {scenarioLabel && (
                    <Line
                      type="monotone"
                      dataKey="scenario"
                      name={scenarioLabel}
                      stroke="var(--ag-success)"
                      strokeWidth={2.2}
                      dot={false}
                      connectNulls={false}
                    />
                  )}
                </LineChart>
              </ChartFrame>
            ) : (
              <LoadingBlock height={300} />
            )}
            <p className="section-note">
              Linha cheia: nível medido pelos sensores dos reservatórios. Tracejadas: projeção com a
              previsão real dos próximos 16 dias e, depois, a climatologia — e o{" "}
              <Term explain="estresse">teste de estresse</Term>.
            </p>
          </PanelBody>
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Teste de estresse"
              icon={ShieldCheck}
              info="estresse"
              hint="clique para ver no gráfico"
            />
            <table className="scenario-table">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th className="is-numeric">Criticidade</th>
                  <th className="is-numeric">Ganho</th>
                </tr>
              </thead>
              <tbody>
                {(data?.scenarios ?? []).map((item) => (
                  <tr
                    key={item.id}
                    className={
                      !custom &&
                      (data?.selectedScenario === item.id ||
                        (item.id === "atual" && data?.selectedScenario === "atual"))
                        ? "is-selected"
                        : undefined
                    }
                    onClick={() => {
                      setCustom(null);
                      setScenarioId(item.id);
                    }}
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.detail}</small>
                    </td>
                    <td className="is-numeric">
                      {daysLabel(item.daysToCritical, data?.horizonDays)}
                    </td>
                    <td className="is-numeric">
                      {item.gain === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="text-success">+{item.gain} d</span>
                      )}
                    </td>
                  </tr>
                ))}
                {custom && data?.custom && (
                  <tr className="is-selected is-simulated">
                    <td>
                      <strong>Cenário personalizado</strong>
                      <small>
                        Pressão −{custom.pressureReduction}%
                        {custom.transfer ? " · transferência" : ""}
                        {custom.campaign ? " · campanha" : ""} ·{" "}
                        {RAIN_OPTIONS.find((r) => r.id === custom.rain)?.label}
                      </small>
                    </td>
                    <td className="is-numeric">
                      {daysLabel(data.custom.daysToCritical, data.horizonDays)}
                    </td>
                    <td className="is-numeric">
                      <span className="text-success">
                        {data.custom.gain !== null ? `+${data.custom.gain} d` : "—"}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <PanelFooter>
              <p className="section-note">
                Cada medida é avaliada sob estresse: onda de calor (+1,8 °C), metade da chuva e mais
                um poço parado.
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
          description="Nível dos reservatórios (sensores), produção dos poços, consumo e o clima real que move a demanda"
          aside={
            <>
              <OriginBadge origin="simulado" label="Sensores simulados" />
              <OriginBadge origin="real" label="Clima real" />
            </>
          }
        />
        {levelSensors.length > 0 && <SensorGrid readings={levelSensors} base={base.data} />}
        <div className="grid-2">
          <Panel>
            <PanelHeader
              title={`Produção × consumo · ${focus?.name ?? ""}`}
              info="margem"
              hint="m³/dia · 45 dias para trás e para frente"
              action={
                <ChartLegend
                  items={[
                    { label: "Produção dos poços", color: "var(--ag-teal)" },
                    { label: "Consumo", color: "var(--ag-blue)" },
                    { label: "Consumo + perdas", color: "var(--ag-warning)", dashed: true },
                  ]}
                />
              }
            />
            <PanelBody>
              {data ? (
                <ChartFrame height={210}>
                  <ComposedChart data={balanceChart} margin={CHART_MARGIN}>
                    <defs>
                      <linearGradient id="ag-demand-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ag-blue)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--ag-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      dataKey="day"
                      type="number"
                      domain={[-45, 44]}
                      ticks={[-45, -30, -15, 0, 15, 30, 44]}
                      tickFormatter={(d: number) => (d === 0 ? "hoje" : `${d > 0 ? "+" : ""}${d}`)}
                      {...AXIS}
                    />
                    <YAxis
                      {...AXIS_Y}
                      width={52}
                      tickFormatter={(v: number) => `${num(v / 1000, 0)} mil`}
                      domain={["dataMin - 2000", "dataMax + 1000"]}
                    />
                    <ReferenceLine x={0} stroke="var(--ag-text-2)" strokeDasharray="3 3" />
                    <Tooltip
                      content={<AgTooltip unit=" m³" decimals={0} />}
                      labelFormatter={(d: number) =>
                        d === 0 ? "Hoje" : d < 0 ? `${-d} dias atrás` : `daqui a ${d} dias`
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="demand"
                      name="Consumo"
                      stroke="var(--ag-blue)"
                      strokeWidth={1.6}
                      fill="url(#ag-demand-fill)"
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Consumo + perdas"
                      stroke="var(--ag-warning)"
                      strokeWidth={1.6}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="production"
                      name="Produção dos poços"
                      stroke="var(--ag-teal)"
                      strokeWidth={2.2}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={210} />
              )}
              <p className="section-note">
                Quando a linha tracejada (o que a cidade precisa) passa da verde (o que os poços
                entregam), a reservação desce.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Clima real de Ribeirão Preto"
              icon={CloudSun}
              hint={
                data?.weatherSource === "open-meteo"
                  ? "Open-Meteo · observado + previsão"
                  : "climatologia"
              }
              action={
                <ChartLegend
                  items={[
                    { label: "Chuva (mm)", color: "var(--ag-blue)" },
                    { label: "Máxima (°C)", color: "var(--ag-high)" },
                  ]}
                />
              }
            />
            <PanelBody>
              {data ? (
                <ChartFrame height={210}>
                  <ComposedChart data={climateChart} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      dataKey="day"
                      type="number"
                      domain={[-45, 15]}
                      ticks={[-45, -30, -15, 0, 15]}
                      tickFormatter={(d: number) => (d === 0 ? "hoje" : `${d > 0 ? "+" : ""}${d}`)}
                      {...AXIS}
                    />
                    <YAxis yAxisId="rain" {...AXIS_Y} width={34} unit="" />
                    <YAxis
                      yAxisId="temp"
                      orientation="right"
                      domain={[15, 40]}
                      {...AXIS_Y}
                      width={30}
                      unit="°"
                    />
                    <ReferenceLine
                      yAxisId="rain"
                      x={0}
                      stroke="var(--ag-text-2)"
                      strokeDasharray="3 3"
                    />
                    <Tooltip
                      content={<AgTooltip decimals={1} caption="Depois de hoje: previsão" />}
                      labelFormatter={(d: number) =>
                        d === 0 ? "Hoje" : d < 0 ? `${-d} dias atrás` : `daqui a ${d} dias`
                      }
                    />
                    <Bar
                      yAxisId="rain"
                      dataKey="rain"
                      name="Chuva (mm)"
                      fill="var(--ag-blue)"
                      fillOpacity={0.55}
                      radius={[2, 2, 0, 0]}
                      barSize={5}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tmax"
                      name="Máxima (°C)"
                      stroke="var(--ag-high)"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={210} />
              )}
              <p className="section-note">
                O consumo sobe cerca de 1,8% por grau acima de 28 °C; dias de chuva reduzem a
                demanda. O <Term explain="aquifero">Aquífero Guarani</Term> responde em anos, não em
                semanas.
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
          description="Como cada sistema de abastecimento está hoje e quanto aguenta"
          aside={<OriginBadge origin="modelo" />}
        />
        <div className="layout-main">
          <div className="system-grid">
            {(data?.systems ?? []).map((s) => (
              // Não é <button>: o cartão contém o ⓘ dos indicadores, e botão dentro
              // de botão é HTML inválido.
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={s.id === data?.focus}
                className={`system-card level-${s.severity}${s.id === data?.focus ? " is-selected" : ""}`}
                onClick={() => {
                  setSystem(s.id);
                  setCustom(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSystem(s.id);
                  setCustom(null);
                }}
              >
                <header>
                  <strong>{s.name}</strong>
                  <StatusBadge level={s.severity} />
                </header>
                <div className="system-card-level">
                  <b>{num(s.level, 0)}%</b>
                  <small>reservação · {signed(s.trend7d)} p.p. em 7 dias</small>
                </div>
                <MetricGrid columns={2}>
                  <Metric
                    label="Margem"
                    value={`${signed(s.margin)}%`}
                    tone={s.margin < 0 ? "critical" : "teal"}
                    info="margem"
                  />
                  <Metric label="Poços parados" value={String(s.wellsOffline)} />
                  <Metric
                    label="Criticidade"
                    value={daysLabel(s.daysToCritical, data?.horizonDays)}
                    hint="tendência"
                  />
                  <Metric
                    label="Sob estresse"
                    value={daysLabel(s.adverseDays, data?.horizonDays)}
                    tone={s.adverseDays !== null && s.adverseDays <= 30 ? "high" : undefined}
                  />
                </MetricGrid>
                <small className="system-card-sectors">{s.sectorNames.join(" · ")}</small>
              </div>
            ))}
            {!data && <LoadingBlock height={220} />}
          </div>
          <Panel flush className="map-panel-compact">
            <PanelHeader title="Mapa dos sistemas" hint="reservação por setor" />
            {base.data ? (
              <OpsMap
                base={base.data}
                layers={MAP_LAYERS}
                sectorStyles={sectorStyles}
                readings={readings}
                compact
                legend={null}
              />
            ) : (
              <LoadingBlock height={240} />
            )}
          </Panel>
        </div>
      </StorySection>

      {/* 03 — Ações recomendadas */}
      <StorySection>
        <SectionHeading
          index={3}
          title="Ações recomendadas"
          description="Medidas ordenadas pelo tempo que compram no teste de estresse"
        />
        <Panel flush>
          {droughtActions.length > 0 ? (
            <ActionList
              items={droughtActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                impact: action.impact,
                priority: action.priority,
                level: action.level,
                time: action.horizon,
              }))}
            />
          ) : (
            <p className="empty-hint">
              {decisions.isLoading
                ? "Carregando…"
                : "Nenhum sistema exige medida preventiva neste momento."}
            </p>
          )}
        </Panel>
      </StorySection>

      <Dialog
        open={simulatorOpen}
        onOpenChange={(open) => {
          setSimulatorOpen(open);
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="simulator-dialog">
          <DialogHeader>
            <DialogTitle>Simulador operacional · {focus?.name ?? "sistema"}</DialogTitle>
            <DialogDescription>
              Combine medidas e um perfil de clima. O motor recalcula o balanço diário dos próximos
              150 dias.
            </DialogDescription>
          </DialogHeader>

          <div className="sim-form">
            <div className="sim-field">
              <div className="sim-field-head">
                <span>Redução de pressão nas VRPs</span>
                <strong>{draft.pressureReduction}%</strong>
              </div>
              <Slider
                value={[draft.pressureReduction]}
                min={0}
                max={20}
                step={1}
                onValueChange={(values) =>
                  setDraft((d) => ({ ...d, pressureReduction: values[0] ?? 0 }))
                }
              />
              <small>Menos pressão, menos vazamento (modelo FAVAD). Plena entre 23h e 05h.</small>
            </div>
            <div className="sim-row">
              <div>
                <span>Transferência de outro sistema</span>
                <small>Até 1.600 m³/dia pelas adutoras existentes, sem obra.</small>
              </div>
              <Switch
                checked={draft.transfer}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, transfer: checked }))}
              />
            </div>
            <div className="sim-row">
              <div>
                <span>Campanha direcionada de consumo</span>
                <small>−2% no consumo em 10 dias.</small>
              </div>
              <Switch
                checked={draft.campaign}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, campaign: checked }))}
              />
            </div>
            <div className="sim-field">
              <div className="sim-field-head">
                <span>Clima projetado</span>
              </div>
              <SegmentedControl
                options={RAIN_OPTIONS}
                value={draft.rain}
                onChange={(rain) => setDraft((d) => ({ ...d, rain }))}
              />
            </div>

            <div className="sim-result">
              {simulation.isFetching ? (
                <div className="sim-processing">
                  <Loader2 />
                  <span>Recalculando 150 dias de balanço hídrico…</span>
                </div>
              ) : simulation.data?.custom && preview ? (
                <>
                  <div className="sim-result-main">
                    <span>Dias até criticidade neste clima</span>
                    <strong>
                      {daysLabel(simulation.data.custom.baseline, simulation.data.horizonDays)}{" "}
                      <em>→</em>{" "}
                      {daysLabel(
                        simulation.data.custom.daysToCritical,
                        simulation.data.horizonDays,
                      )}
                    </strong>
                  </div>
                  <StatusBadge
                    level={(simulation.data.custom.gain ?? 0) > 0 ? "normal" : "attention"}
                  >
                    {(simulation.data.custom.gain ?? 0) > 0
                      ? `+${simulation.data.custom.gain} dias`
                      : "sem ganho"}
                  </StatusBadge>
                </>
              ) : (
                <div className="sim-processing is-idle">
                  <FlaskConical />
                  <span>Ajuste as medidas e clique em “Executar simulação”.</span>
                </div>
              )}
            </div>

            {simulation.data?.custom && preview && !simulation.isFetching && (
              <ul className="sim-breakdown">
                {simulation.data.custom.breakdown.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <b className={item.days < 0 ? "text-critical" : undefined}>
                      {item.days >= 0 ? "+" : "−"}
                      {Math.abs(item.days)} dias
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreview({ ...draft })}
              disabled={simulation.isFetching}
            >
              Executar simulação
            </Button>
            <Button
              variant="operational"
              disabled={!preview || simulation.isFetching}
              onClick={() => {
                if (!preview) return;
                setCustom(preview);
                setSimulatorOpen(false);
                const result = simulation.data?.custom;
                toast.success("Cenário aplicado à projeção.", {
                  description: result
                    ? `${daysLabel(result.baseline)} → ${daysLabel(result.daysToCritical)} até a zona crítica.`
                    : "Projeção atualizada.",
                });
              }}
            >
              Aplicar ao gráfico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
