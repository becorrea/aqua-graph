import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  Droplets,
  Gauge,
  Play,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { CityMap } from "@/components/aquagraph/CityMap";
import { DetailDrawer } from "@/components/aquagraph/DetailDrawer";
import {
  AgTooltip,
  AXIS,
  CHART_MARGIN,
  ChartFrame,
  ChartLegend,
  GRID,
} from "@/components/aquagraph/charts";
import { useDemoCue } from "@/components/aquagraph/DemoMode";
import { EventList, EvidenceList } from "@/components/aquagraph/lists";
import {
  ConfidenceBar,
  KpiCard,
  KpiStrip,
  LiveTag,
  Metric,
  MetricGrid,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  StatusBadge,
  SubTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  evidenceFactors,
  hydraulicDay,
  leakAction,
  leakDetail,
  leakEvidence,
  leakKpis,
  leakSimulationSteps,
  lossTrend,
  sectorAnomalies,
} from "@/data/leaks";
import { priorityPipes } from "@/data/waterNetwork";
import { kpiSparklines } from "@/data/recommendations";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/perdas")({
  head: pageHead(
    "Perdas e Vazamentos",
    "Detecção preditiva de anomalias hidráulicas e priorização inteligente de inspeções de campo.",
  ),
  component: LeaksPage,
});

const BASE_PROBABILITY = leakDetail.probability;
const FLOOR_PROBABILITY = 30;

/** Converte a probabilidade exibida em intensidade de heatmap (0–1). */
function toIntensity(probability: number) {
  return Math.min(
    1,
    Math.max(0, (probability - FLOOR_PROBABILITY) / (BASE_PROBABILITY - FLOOR_PROBABILITY)),
  );
}

function LeaksPage() {
  const [probability, setProbability] = useState(BASE_PROBABILITY);
  const [simulating, setSimulating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string | null>("14-B");
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  /** Reproduz a evolução de um vazamento progressivo no setor 14-B. */
  const runSimulation = useCallback(() => {
    clearTimers();
    setSimulating(true);
    setDrawerOpen(false);
    setSelectedSector("14-B");
    setProbability(leakSimulationSteps[0] ?? 0);

    leakSimulationSteps.slice(1).forEach((step, index) => {
      timers.current.push(window.setTimeout(() => setProbability(step), 900 * (index + 1)));
    });

    timers.current.push(
      window.setTimeout(() => {
        setSimulating(false);
        setDrawerOpen(true);
        toast.warning("Anomalia hidráulica detectada.", {
          description: "Setor 14-B — padrão consistente com perda física na rede.",
        });
      }, 900 * leakSimulationSteps.length),
    );
  }, []);

  useDemoCue("leaks", runSimulation);

  const intensity = toIntensity(probability);
  const pressureSeries = hydraulicDay;

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Telemetria de 18 pontos · janela de 24 h</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Faixa estimada de perda: {leakKpis.lostVolumeRange} · valores de modelo
          </span>
        </div>
        <div className="toolbar-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={simulating}>
                <Play />
                {simulating ? `Analisando · ${probability}%` : "Simular evento"}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Cenários disponíveis</DropdownMenuLabel>
              <DropdownMenuItem onClick={runSimulation}>Vazamento progressivo</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  clearTimers();
                  setSimulating(false);
                  setProbability(BASE_PROBABILITY);
                  setDrawerOpen(false);
                }}
              >
                Restaurar situação atual
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={Droplets}
          label="Perda estimada"
          value={`${leakKpis.lossRate.toLocaleString("pt-BR")}%`}
          delta={`▼ ${Math.abs(leakKpis.lossRateTrend).toLocaleString("pt-BR")} p.p.`}
          deltaTone="positive"
          hint="índice de perdas na distribuição"
          tone="cyan"
          spark={kpiSparklines.loss}
        />
        <KpiCard
          icon={Gauge}
          label="Volume estimado perdido"
          value={String(leakKpis.lostVolume)}
          unit="m³/h"
          delta={`faixa ${leakKpis.lostVolumeRange}`}
          deltaTone="neutral"
          hint="estimativa do modelo hidráulico"
          tone="warning"
          spark={[41, 46, 44, 49, 53, 55, 58]}
        />
        <KpiCard
          icon={Activity}
          label="Setores críticos"
          value={String(leakKpis.criticalSectors)}
          delta={`▲ ${leakKpis.criticalSectorsTrend}`}
          deltaTone="negative"
          hint="de 9 setores monitorados"
          tone="critical"
          spark={kpiSparklines.criticalAreas}
          sparkKind="bars"
        />
        <KpiCard
          icon={BrainCircuit}
          label="Confiança"
          value={`${simulating ? probability : leakKpis.confidence}%`}
          delta={simulating ? "atualizando modelo" : "alta confiança"}
          deltaTone={simulating ? "neutral" : "positive"}
          hint="validado contra histórico de reparos"
          tone="success"
          spark={kpiSparklines.confidence}
          progress={simulating ? probability : leakKpis.confidence}
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Probabilidade de vazamento por setor"
            hint="modelo preditivo"
            action={
              <>
                <StatusBadge level="critical">14-B · {probability}%</StatusBadge>
                <LiveTag>{simulating ? "simulação em curso" : "ao vivo"}</LiveTag>
              </>
            }
          />
          <CityMap
            variant="leaks"
            intensity={intensity}
            selectedSector={selectedSector}
            onSelectSector={(sectorId) => {
              setSelectedSector(sectorId);
              if (sectorId === "14-B") setDrawerOpen(true);
            }}
            highlightPipes={priorityPipes.map((pipe) => pipe.id)}
          />
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Anomalias detectadas"
              icon={TriangleAlert}
              action={<span className="panel-hint">últimas 24 h</span>}
            />
            <EventList
              items={sectorAnomalies.map((item, index) =>
                index === 0 ? { ...item, metric: `${probability}%` } : item,
              )}
              selectedId={selectedSector === "14-B" ? (sectorAnomalies[0]?.id ?? null) : null}
              onSelect={(item) => {
                const sectorId = item.place.replace("Setor ", "");
                setSelectedSector(sectorId);
                if (sectorId === "14-B") setDrawerOpen(true);
              }}
            />
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Trechos mais prováveis"
              hint="setor 14-B"
              action={<span className="panel-hint">probabilidade</span>}
            />
            <ul className="pipe-list">
              {priorityPipes.map((pipe, index) => (
                <li key={pipe.id}>
                  <button type="button" onClick={() => setDrawerOpen(true)}>
                    <span className="pipe-rank">{index + 1}</span>
                    <span className="pipe-info">
                      <strong>{pipe.label}</strong>
                      <small>
                        {pipe.diameter} · {pipe.material} · {pipe.length} · {pipe.installedIn}
                      </small>
                      <span className="pipe-bar">
                        <i style={{ width: `${pipe.probability}%` }} />
                      </span>
                    </span>
                    <b>{pipe.probability}%</b>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <div className="grid-2">
        <Panel>
          <PanelHeader
            title="Evolução do índice de perdas"
            hint="12 meses"
            action={<ChartLegend items={[{ label: "Perda estimada", color: "var(--ag-cyan)" }]} />}
          />
          <PanelBody>
            <ChartFrame height={186}>
              <AreaChart data={lossTrend} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="ag-loss-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ag-cyan)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--ag-cyan)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="month" {...AXIS} />
                <YAxis domain={[10, 18]} unit="%" {...AXIS} width={44} />
                <Tooltip
                  content={<AgTooltip unit="%" />}
                  cursor={{ stroke: "var(--ag-border-strong)" }}
                />
                <Area
                  type="monotone"
                  dataKey="loss"
                  name="Perda estimada"
                  stroke="var(--ag-cyan)"
                  strokeWidth={2}
                  fill="url(#ag-loss-fill)"
                />
              </AreaChart>
            </ChartFrame>
            <p className="section-note">
              Queda de 4,8 p.p. em 12 meses, concentrada nos setores com inspeção priorizada pelo
              modelo.
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Ação recomendada" icon={Wrench} />
          <PanelBody>
            <div className="action-card">
              <div className="action-card-head">
                <div>
                  <h3>{leakAction.title}</h3>
                  <p>{leakAction.rationale}</p>
                </div>
                <StatusBadge level="critical">Prioridade {leakAction.priority}</StatusBadge>
              </div>
              <MetricGrid columns={3}>
                <Metric label="Janela recomendada" value={leakAction.window} />
                <Metric label="Equipe sugerida" value={leakAction.team} />
                <Metric label="Tipo" value={leakAction.order.type} />
              </MetricGrid>
            </div>
          </PanelBody>
          <PanelFooter>
            <div className="footer-actions">
              <Button variant="outline" onClick={() => setDrawerOpen(true)}>
                Ver análise completa
              </Button>
              <Button variant="operational" onClick={() => setOrderOpen(true)}>
                Gerar ordem de serviço
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        eyebrow="Análise de anomalia"
        title={`Setor ${leakDetail.sector}`}
        subtitle={`${leakDetail.district} · ${leakDetail.connections.toLocaleString("pt-BR")} ligações · rede de ${leakDetail.networkExtension}`}
        badge={<StatusBadge level="critical" />}
        footer={
          <div className="footer-actions">
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>
              Fechar
            </Button>
            <Button variant="operational" onClick={() => setOrderOpen(true)}>
              Gerar ordem de serviço
            </Button>
          </div>
        }
      >
        <MetricGrid columns={3}>
          <Metric label="Prob. de vazamento" value={`${probability}%`} tone="critical" />
          <Metric label="Perda estimada" value={leakDetail.estimatedLoss} tone="warning" />
          <Metric
            label="Pressão"
            value={`▼ ${Math.abs(leakDetail.pressureVariation)}%`}
            tone="critical"
          />
          <Metric label="Vazão" value={`▲ ${leakDetail.flowVariation}%`} tone="high" />
          <Metric label="Consumo esperado" value={leakDetail.expectedConsumption} />
          <Metric
            label="Última manutenção"
            value={`${leakDetail.lastMaintenanceDays} dias`}
            hint={`idade média da rede ${leakDetail.averageAge}`}
          />
        </MetricGrid>

        <section className="drawer-section">
          <SubTitle>Por que o modelo gerou este alerta?</SubTitle>
          <div className="evidence-strip">
            {evidenceFactors.map((factor) => (
              <div className={`evidence-chip level-${factor.level}`} key={factor.label}>
                <span>{factor.label}</span>
                <strong>{factor.reading}</strong>
                <i>
                  <b style={{ width: `${factor.weight}%` }} />
                </i>
                <small>peso {factor.weight}</small>
              </div>
            ))}
          </div>
          <p className="ai-conclusion">
            <BrainCircuit />
            {leakDetail.conclusion}
          </p>
          <ConfidenceBar value={probability} />
        </section>

        <section className="drawer-section">
          <SubTitle action={<span className="panel-hint">observado vs. esperado</span>}>
            Ciclo hidráulico de 24 h
          </SubTitle>
          <ChartFrame height={168}>
            <AreaChart data={pressureSeries} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="ag-pressure-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ag-critical)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--ag-critical)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="hour" interval={1} {...AXIS} />
              <YAxis domain={[24, 38]} {...AXIS} width={40} />
              <Tooltip content={<AgTooltip unit=" mca" />} />
              <Area
                type="monotone"
                dataKey="pressure"
                name="Pressão observada"
                stroke="var(--ag-critical)"
                strokeWidth={2}
                fill="url(#ag-pressure-fill)"
              />
              <Line
                type="monotone"
                dataKey="expectedPressure"
                name="Pressão esperada"
                stroke="var(--ag-text-2)"
                strokeWidth={1.6}
                strokeDasharray="5 4"
                dot={false}
              />
            </AreaChart>
          </ChartFrame>
          <ChartLegend
            items={[
              { label: "Observada", color: "var(--ag-critical)" },
              { label: "Esperada", color: "var(--ag-text-2)", dashed: true },
            ]}
          />
        </section>

        <section className="drawer-section">
          <SubTitle>Principais evidências</SubTitle>
          <EvidenceList items={leakEvidence} />
        </section>

        <section className="drawer-section">
          <SubTitle action={<span className="panel-hint">probabilidade por trecho</span>}>
            Trechos mais prováveis
          </SubTitle>
          <ul className="pipe-list is-plain">
            {priorityPipes.map((pipe, index) => (
              <li key={pipe.id}>
                <div className="pipe-static">
                  <span className="pipe-rank">{index + 1}</span>
                  <span className="pipe-info">
                    <strong>{pipe.label}</strong>
                    <small>
                      {pipe.diameter} · {pipe.material} · instalado em {pipe.installedIn}
                    </small>
                    <span className="pipe-bar">
                      <i style={{ width: `${pipe.probability}%` }} />
                    </span>
                  </span>
                  <b>{pipe.probability}%</b>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="drawer-section">
          <SubTitle>Ação recomendada</SubTitle>
          <div className="action-card is-compact">
            <div className="action-card-head">
              <div>
                <h3>{leakAction.title}</h3>
                <p>
                  {leakAction.window} · {leakAction.team}
                </p>
              </div>
              <StatusBadge level="critical">{leakAction.priority}</StatusBadge>
            </div>
          </div>
        </section>
      </DetailDrawer>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="order-dialog">
          <DialogHeader>
            <DialogTitle>Gerar ordem de serviço</DialogTitle>
            <DialogDescription>
              Revise a recomendação antes de encaminhar à equipe de campo.
            </DialogDescription>
          </DialogHeader>
          <div className="order-grid">
            <div>
              <span>Número</span>
              <strong>{leakAction.order.number}</strong>
            </div>
            <div>
              <span>Ativo</span>
              <strong>{leakAction.order.asset}</strong>
            </div>
            <div>
              <span>Prioridade</span>
              <strong className="text-critical">{leakAction.order.priority}</strong>
            </div>
            <div>
              <span>Equipe</span>
              <strong>{leakAction.order.team}</strong>
            </div>
            <div>
              <span>Prazo</span>
              <strong>{leakAction.order.deadline}</strong>
            </div>
            <div>
              <span>Tipo de serviço</span>
              <strong>{leakAction.order.type}</strong>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="operational"
              onClick={() => {
                setOrderOpen(false);
                toast.success("Ordem de serviço criada com sucesso.", {
                  description: `${leakAction.order.number} · ${leakAction.order.team} · ${leakAction.order.deadline}`,
                });
              }}
            >
              Confirmar ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
