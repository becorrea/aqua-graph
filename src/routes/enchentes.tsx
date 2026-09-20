import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CloudRain, Clock, CloudLightning, MapPinned, TriangleAlert, Waves, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { ActionList, EventList } from "@/components/aquagraph/lists";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelBody,
  PanelHeader,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import {
  floodActions,
  floodAlert,
  floodHotspots,
  floodKpis,
  floodOccurrences,
  rainForecast,
  rainSimulationSteps,
  riverLevels,
} from "@/data/floodEvents";
import type { MapLayerId } from "@/data/waterNetwork";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/enchentes")({
  head: pageHead(
    "Enchentes e Resposta Rápida",
    "Antecipação de risco hidrológico urbano e coordenação operacional em tempo quase real.",
  ),
  component: FloodPage,
});

const MAP_TABS = [
  { id: "risk", label: "Risco de enchente" },
  { id: "river", label: "Nível dos rios" },
  { id: "rain", label: "Precipitação" },
] as const;

type MapTab = (typeof MAP_TABS)[number]["id"];

const TAB_LAYERS: Record<MapTab, Partial<Record<MapLayerId, boolean>>> = {
  risk: { "flood-risk": true },
  river: { "flood-risk": false, "river-level": true, "rain-radar": false },
  rain: { "flood-risk": false, "rain-radar": true, "river-level": false },
};

const MAX_RAIN = floodKpis.forecastRain;

function FloodPage() {
  const [accumulated, setAccumulated] = useState(MAX_RAIN);
  const [simulating, setSimulating] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [tab, setTab] = useState<MapTab>("risk");
  const timers = useRef<number[]>([]);

  const runSimulation = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setSimulating(true);
    setAlertVisible(false);
    setTab("risk");
    setAccumulated(rainSimulationSteps[0] ?? 0);

    rainSimulationSteps.slice(1).forEach((step, index) => {
      timers.current.push(window.setTimeout(() => setAccumulated(step), 950 * (index + 1)));
    });

    timers.current.push(
      window.setTimeout(() => {
        setSimulating(false);
        setAlertVisible(true);
        toast.error("Risco crítico detectado.", {
          description: "Rua A — Centro: nível crítico projetado em 43 minutos.",
        });
      }, 950 * rainSimulationSteps.length),
    );
  }, []);

  useDemoCue("flood", runSimulation);

  const intensity = Math.min(1, accumulated / MAX_RAIN);

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Radar meteorológico · atualizado há 4 min</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Acumulado projetado: {accumulated} mm em 3 h · capacidade de drenagem excedida em 12
            trechos
          </span>
        </div>
        <div className="toolbar-right">
          <Button variant="outline" size="sm" onClick={runSimulation} disabled={simulating}>
            <CloudLightning />
            {simulating ? `Processando · ${accumulated} mm` : "Simular chuva extrema"}
          </Button>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={CloudRain}
          label="Chuva prevista"
          value={String(accumulated)}
          unit="mm / 3h"
          delta={`▲ ${floodKpis.rainTrend}%`}
          deltaTone="negative"
          hint={floodKpis.forecastWindow}
          tone="blue"
          spark={rainForecast.map((point) => point.accumulated)}
          progress={(accumulated / MAX_RAIN) * 100}
        />
        <KpiCard
          icon={TriangleAlert}
          label="Risco hidrológico"
          value={
            intensity > 0.8 ? floodKpis.hydrologicalRisk : intensity > 0.5 ? "MODERADO" : "BAIXO"
          }
          hint={floodKpis.riskTrend}
          tone={intensity > 0.8 ? "critical" : intensity > 0.5 ? "warning" : "teal"}
          status={intensity > 0.8 ? "critical" : intensity > 0.5 ? "attention" : "normal"}
        />
        <KpiCard
          icon={MapPinned}
          label="Áreas críticas"
          value={String(Math.max(2, Math.round(floodKpis.criticalAreas * intensity)))}
          delta={`▲ ${floodKpis.criticalAreasTrend}`}
          deltaTone="negative"
          hint="em monitoramento ativo"
          tone="high"
          spark={[4, 5, 6, 7, 9, 11, 12]}
          sparkKind="bars"
        />
        <KpiCard
          icon={Clock}
          label="Tempo estimado"
          value={String(floodKpis.minutesToPeak)}
          unit="min"
          delta="até o pico do evento"
          deltaTone="neutral"
          hint="Rua A — Centro"
          tone="warning"
        />
      </KpiStrip>

      <AnimatePresence>
        {alertVisible && (
          <motion.div
            className="alert-banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <span className="alert-banner-icon">
              <TriangleAlert />
            </span>
            <div className="alert-banner-text">
              <strong>{floodAlert.title}</strong>
              <p>{floodAlert.message}</p>
            </div>
            <div className="alert-banner-actions">
              <Button size="sm" variant="operational">
                Acionar protocolo
              </Button>
              <button
                type="button"
                onClick={() => setAlertVisible(false)}
                aria-label="Dispensar alerta"
              >
                <X />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Monitor de eventos críticos"
            hint="situação hidrológica em tempo real"
            action={
              <>
                <StatusBadge level={intensity > 0.8 ? "critical" : "attention"}>
                  {accumulated} mm
                </StatusBadge>
                <LiveTag>{simulating ? "simulação em curso" : "ao vivo"}</LiveTag>
              </>
            }
          />
          <CityMap
            variant="flood"
            intensity={intensity}
            markers={floodHotspots}
            sectorLabels="codes"
            tabs={MAP_TABS}
            activeTab={tab}
            onTabChange={(id) => setTab(id as MapTab)}
            overrideLayers={TAB_LAYERS[tab]}
          />
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Ocorrências priorizadas"
              icon={Waves}
              action={<span className="panel-hint">{floodOccurrences.length} ativas</span>}
            />
            <EventList items={floodOccurrences} />
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Ações recomendadas"
              action={<span className="panel-hint">janela</span>}
            />
            <ActionList
              numbered={false}
              items={floodActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                priority: action.priority,
                level: action.level,
                icon: action.icon,
                time: action.time,
              }))}
            />
          </Panel>
        </aside>
      </div>

      <div className="grid-2">
        <Panel>
          <PanelHeader
            title="Precipitação projetada"
            hint="radar · janelas de 30 min"
            action={
              <ChartLegend
                items={[
                  { label: "Intensidade (mm/h)", color: "var(--ag-blue)" },
                  { label: "Acumulado (mm)", color: "var(--ag-cyan)" },
                ]}
              />
            }
          />
          <PanelBody>
            <ChartFrame height={178}>
              <ComposedChart data={rainForecast} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis {...AXIS} width={40} />
                <Tooltip
                  content={<AgTooltip decimals={0} />}
                  cursor={{ fill: "oklch(0.8276 0.1013 230.32 / 0.06)" }}
                />
                <Bar
                  dataKey="intensity"
                  name="Intensidade (mm/h)"
                  fill="var(--ag-blue)"
                  fillOpacity={0.45}
                  radius={[3, 3, 0, 0]}
                  barSize={18}
                />
                <Line
                  type="monotone"
                  dataKey="accumulated"
                  name="Acumulado (mm)"
                  stroke="var(--ag-cyan)"
                  strokeWidth={2.2}
                  dot={{ r: 2.5, fill: "var(--ag-cyan)", strokeWidth: 0 }}
                />
              </ComposedChart>
            </ChartFrame>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Nível do Ribeirão das Águas"
            hint="régua da confluência central"
            action={
              <ChartLegend
                items={[
                  { label: "Nível observado", color: "var(--ag-cyan)" },
                  { label: "Cota de alerta", color: "var(--ag-warning)", dashed: true },
                  { label: "Cota de inundação", color: "var(--ag-critical)", dashed: true },
                ]}
              />
            }
          />
          <PanelBody>
            <ChartFrame height={178}>
              <AreaChart data={riverLevels} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="ag-river-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ag-cyan)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--ag-cyan)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" {...AXIS} />
                <YAxis domain={[0, 5]} unit="m" {...AXIS} width={42} />
                <Tooltip content={<AgTooltip unit=" m" decimals={2} />} />
                <ReferenceLine y={3.2} stroke="var(--ag-warning)" strokeDasharray="5 4" />
                <ReferenceLine y={4.1} stroke="var(--ag-critical)" strokeDasharray="5 4" />
                <Area
                  type="monotone"
                  dataKey="level"
                  name="Nível observado"
                  stroke="var(--ag-cyan)"
                  strokeWidth={2.2}
                  fill="url(#ag-river-fill)"
                />
              </AreaChart>
            </ChartFrame>
            <p className="section-note">
              Cota de alerta superada às 11h. Projeção indica ultrapassagem da cota de inundação em
              aproximadamente 43 minutos.
            </p>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
