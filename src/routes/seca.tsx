import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  ChartNoAxesCombined,
  Droplets,
  Loader2,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { CityMap } from "@/components/aquagraph/CityMap";
import {
  AgTooltip,
  AXIS,
  CHART_MARGIN,
  ChartFrame,
  ChartLegend,
  GRID,
} from "@/components/aquagraph/charts";
import { useDemoCue } from "@/components/aquagraph/DemoMode";
import { ActionList } from "@/components/aquagraph/lists";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Metric,
  MetricGrid,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/aquagraph/primitives";
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
import {
  CRITICAL_LEVEL,
  TREND_DOMAIN,
  monthTickLabel,
  monthTicks,
  reservoirKpis,
  reservoirTrend,
  reservoirs,
  scenarioSeries,
} from "@/data/reservoirs";
import {
  baselineScenario,
  droughtActions,
  droughtLevel,
  droughtRegions,
  droughtScenarios,
  rainfallOutlooks,
  simulateHorizon,
  type RainfallOutlook,
} from "@/data/droughtScenarios";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/seca")({
  head: pageHead(
    "Seca e Resiliência",
    "Projeção de criticidade dos reservatórios, cenários operacionais e resposta preventiva.",
  ),
  component: DroughtPage,
});

function DroughtPage() {
  const [scenarioId, setScenarioId] = useState(baselineScenario.id);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [pressureReduction, setPressureReduction] = useState(11);
  const [transfer, setTransfer] = useState(true);
  const [campaign, setCampaign] = useState(false);
  const [rainfall, setRainfall] = useState<RainfallOutlook>("abaixo");
  const [running, setRunning] = useState(false);
  const [simulated, setSimulated] = useState<number | null>(null);

  const scenario = droughtScenarios.find((item) => item.id === scenarioId) ?? baselineScenario;

  const activeCriticalDay = simulated ?? scenario.criticalDay;

  const chartData = useMemo(() => {
    const scenarioPoints = scenarioSeries(activeCriticalDay);
    return reservoirTrend.map((point, index) => ({
      ...point,
      scenario: activeCriticalDay === 53 ? null : (scenarioPoints[index]?.value ?? null),
    }));
  }, [activeCriticalDay]);

  const result = useMemo(
    () => simulateHorizon({ pressureReduction, transfer, campaign, rainfall }),
    [pressureReduction, transfer, campaign, rainfall],
  );

  const runSimulation = useCallback(() => {
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      setSimulated(result.horizon);
      toast.success(
        `Horizonte operacional ampliado de ${result.baseline} para ${result.horizon} dias.`,
        { description: "Cenário aplicado à projeção dos reservatórios." },
      );
    }, 1500);
  }, [result]);

  useDemoCue("drought", () => {
    setScenarioId("pressao");
    setSimulated(78);
  });

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Projeção recalculada há 18 min</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Déficit de chuva acumulado de {Math.abs(reservoirKpis.rainfallDeficit)}% no semestre
          </span>
        </div>
        <div className="toolbar-right">
          <Button variant="outline" size="sm" onClick={() => setSimulatorOpen(true)}>
            <SlidersHorizontal />
            Simular novo cenário
          </Button>
        </div>
      </div>

      <KpiStrip columns={3}>
        <KpiCard
          icon={Droplets}
          label="Nível dos reservatórios"
          value={`${reservoirKpis.level}%`}
          delta={`▼ ${Math.abs(reservoirKpis.levelTrend)} p.p.`}
          deltaTone="negative"
          hint="vs. mês anterior"
          tone="cyan"
          progress={reservoirKpis.level}
          spark={[71, 66, 61, 55, 50, 46, 42]}
        />
        <KpiCard
          icon={CalendarClock}
          label="Dias até criticidade"
          value={`${activeCriticalDay}`}
          unit="dias"
          delta={
            simulated
              ? `▲ ${simulated - reservoirKpis.daysToCritical} dias simulados`
              : `${reservoirKpis.adverseDays} dias em cenário adverso`
          }
          deltaTone={simulated ? "positive" : "negative"}
          hint={`zona crítica abaixo de ${CRITICAL_LEVEL}% de volume`}
          tone={simulated ? "success" : "warning"}
          spark={[62, 60, 58, 57, 55, 54, 53]}
        />
        <KpiCard
          icon={ChartNoAxesCombined}
          label="Demanda projetada"
          value={reservoirKpis.projectedDemand.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
          })}
          unit="m³/s"
          delta={`▲ ${reservoirKpis.demandTrend}%`}
          deltaTone="negative"
          hint="vs. mesma semana do ano anterior"
          tone="high"
          spark={[1.31, 1.34, 1.36, 1.38, 1.4, 1.44, 1.42]}
        />
      </KpiStrip>

      <div className="layout-main">
        <div className="side-stack">
          <Panel>
            <PanelHeader
              title="Tendência dos reservatórios"
              hint="observado e projeções · Out 2025 → Set 2026"
              action={
                <ChartLegend
                  items={[
                    { label: "Nível real", color: "var(--ag-cyan)" },
                    { label: "Cenário base", color: "var(--ag-blue)", dashed: true },
                    { label: "Cenário adverso", color: "var(--ag-high)", dashed: true },
                    ...(activeCriticalDay === 53
                      ? []
                      : [{ label: "Cenário selecionado", color: "var(--ag-success)" }]),
                  ]}
                />
              }
            />
            <PanelBody>
              <ChartFrame height={252}>
                <LineChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid {...GRID} />
                  <ReferenceArea
                    y1={0}
                    y2={CRITICAL_LEVEL}
                    fill="var(--ag-critical)"
                    fillOpacity={0.12}
                    stroke="var(--ag-critical)"
                    strokeOpacity={0.28}
                    strokeDasharray="4 4"
                    label={{
                      value: "Zona crítica",
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
                      position: "top",
                      fill: "var(--ag-text-2)",
                      fontSize: 10,
                    }}
                  />
                  <XAxis
                    dataKey="day"
                    type="number"
                    domain={TREND_DOMAIN}
                    ticks={monthTicks.map((tick) => tick.day)}
                    tickFormatter={(day: number) => monthTickLabel(day)}
                    {...AXIS}
                  />
                  <YAxis domain={[0, 100]} unit="%" {...AXIS} width={46} />
                  <Tooltip
                    content={
                      <AgTooltip unit="%" decimals={0} caption="Projeção do modelo hídrico" />
                    }
                    labelFormatter={(day: number) =>
                      day === 0 ? "Hoje" : `${day > 0 ? "+" : ""}${day} dias`
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="observed"
                    name="Nível real"
                    stroke="var(--ag-cyan)"
                    strokeWidth={2.4}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="base"
                    name="Cenário base"
                    stroke="var(--ag-blue)"
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="adverse"
                    name="Cenário adverso"
                    stroke="var(--ag-high)"
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="scenario"
                    name="Cenário selecionado"
                    stroke="var(--ag-success)"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ChartFrame>
              <MetricGrid columns={3}>
                {reservoirs.map((reservoir) => (
                  <Metric
                    key={reservoir.id}
                    label={reservoir.name.replace("Reservatório ", "")}
                    value={`${reservoir.level}%`}
                    tone={
                      reservoir.daysToCritical <= 30
                        ? "critical"
                        : reservoir.daysToCritical <= 45
                          ? "high"
                          : "teal"
                    }
                    hint={`${reservoir.daysToCritical} dias · atende ${reservoir.supplies}`}
                  />
                ))}
              </MetricGrid>
            </PanelBody>
          </Panel>

          <Panel flush className="map-panel-compact">
            <PanelHeader
              title="Mapa de risco de estiagem"
              hint="dias até criticidade por setor"
              action={
                <div className="inline-legend">
                  {droughtRegions.map((region) => (
                    <span key={region.id} className={`level-${droughtLevel(region.days)}`}>
                      <i />
                      {region.label} · {region.days} dias
                    </span>
                  ))}
                </div>
              }
            />
            <CityMap variant="drought" className="map-frame-sm" />
          </Panel>
        </div>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Cenários simulados"
              action={
                <Button variant="outline" size="sm" onClick={() => setSimulatorOpen(true)}>
                  <Play />
                  Novo cenário
                </Button>
              }
            />
            <table className="scenario-table">
              <thead>
                <tr>
                  <th>Cenário</th>
                  <th className="is-numeric">Criticidade</th>
                  <th className="is-numeric">Variação</th>
                </tr>
              </thead>
              <tbody>
                {droughtScenarios.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === scenarioId ? "is-selected" : undefined}
                    onClick={() => {
                      setScenarioId(item.id);
                      setSimulated(null);
                    }}
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.detail}</small>
                    </td>
                    <td className="is-numeric">{item.criticalDay} dias</td>
                    <td className="is-numeric">
                      {item.gain ? (
                        <span className="text-success">{item.variation}</span>
                      ) : (
                        <span className="text-muted">{item.variation}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {simulated && (
                  <tr className="is-selected is-simulated">
                    <td>
                      <strong>Cenário personalizado</strong>
                      <small>
                        Pressão −{pressureReduction}%{transfer ? " · transferência" : ""}
                        {campaign ? " · campanha" : ""}
                      </small>
                    </td>
                    <td className="is-numeric">{simulated} dias</td>
                    <td className="is-numeric">
                      <span className="text-success">+{simulated - 53} dias</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <PanelFooter>
              <p className="section-note">
                Projeções assumem manutenção do padrão de consumo observado nas últimas 4 semanas.
              </p>
            </PanelFooter>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Ações recomendadas"
              action={<span className="panel-hint">ganho estimado</span>}
            />
            <ActionList
              items={droughtActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                impact: action.impact,
                priority: action.priority,
                level: action.level,
              }))}
            />
          </Panel>
        </aside>
      </div>

      <Dialog open={simulatorOpen} onOpenChange={setSimulatorOpen}>
        <DialogContent className="simulator-dialog">
          <DialogHeader>
            <DialogTitle>Simulador operacional</DialogTitle>
            <DialogDescription>
              Combine medidas e veja o efeito estimado no horizonte de abastecimento.
            </DialogDescription>
          </DialogHeader>

          <div className="sim-form">
            <div className="sim-field">
              <div className="sim-field-head">
                <span>Redução de pressão noturna</span>
                <strong>{pressureReduction}%</strong>
              </div>
              <Slider
                value={[pressureReduction]}
                min={0}
                max={20}
                step={1}
                onValueChange={(values) => setPressureReduction(values[0] ?? 0)}
              />
              <small>Aplicada entre 23h e 05h nos setores Leste e Sul.</small>
            </div>

            <div className="sim-row">
              <div>
                <span>Transferência de água entre setores</span>
                <small>Via adutoras existentes, sem obra civil.</small>
              </div>
              <Switch checked={transfer} onCheckedChange={setTransfer} />
            </div>

            <div className="sim-row">
              <div>
                <span>Campanha direcionada de consumo</span>
                <small>Residencial e grandes consumidores comerciais.</small>
              </div>
              <Switch checked={campaign} onCheckedChange={setCampaign} />
            </div>

            <div className="sim-field">
              <div className="sim-field-head">
                <span>Chuva projetada</span>
              </div>
              <SegmentedControl
                options={rainfallOutlooks.map((item) => ({ id: item.id, label: item.label }))}
                value={rainfall}
                onChange={setRainfall}
              />
            </div>

            <div className="sim-result">
              {running ? (
                <div className="sim-processing">
                  <Loader2 />
                  <span>Processando cenário hidráulico...</span>
                </div>
              ) : (
                <>
                  <div className="sim-result-main">
                    <span>Horizonte operacional estimado</span>
                    <strong>
                      {result.baseline} <em>→</em> {result.horizon} dias
                    </strong>
                  </div>
                  <StatusBadge level={result.horizon > result.baseline ? "normal" : "high"}>
                    {result.horizon >= result.baseline ? "+" : ""}
                    {result.horizon - result.baseline} dias
                  </StatusBadge>
                </>
              )}
            </div>

            <ul className="sim-breakdown">
              <li>
                <span>Redução de pressão</span>
                <b>+{result.pressureGain} dias</b>
              </li>
              <li>
                <span>Transferência entre setores</span>
                <b>+{result.transferGain} dias</b>
              </li>
              <li>
                <span>Campanha de consumo</span>
                <b>+{result.campaignGain} dias</b>
              </li>
              <li>
                <span>Previsão de chuva</span>
                <b className="text-critical">−{result.penalty} dias</b>
              </li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSimulatorOpen(false)}>
              Fechar
            </Button>
            <Button variant="operational" onClick={runSimulation} disabled={running}>
              {running ? "Executando..." : "Executar simulação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
