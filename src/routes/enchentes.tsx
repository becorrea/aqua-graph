import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  CloudLightning,
  CloudRain,
  Clock,
  MapPinned,
  RotateCcw,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  OpsMap,
  type LayerOption,
  type MapFieldSpec,
  type MapLayerKey,
  type MapMarkerSpec,
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
import { ActionList } from "@/components/aquagraph/lists";
import { useScenario } from "@/components/aquagraph/ScenarioContext";
import { SensorGrid } from "@/components/aquagraph/sensors";
import {
  InfoTip,
  KpiCard,
  KpiStrip,
  LiveTag,
  LoadingBlock,
  OriginBadge,
  Panel,
  PanelBody,
  PanelHeader,
  SectionHeading,
  SegmentedControl,
  StatusBadge,
  StoryBanner,
  Term,
} from "@/components/aquagraph/primitives";
import { StorySection } from "@/components/aquagraph/story";
import { Button } from "@/components/ui/button";
import { useDecisions, useFlood, useLive, useMapBase } from "@/lib/api";
import { num, readingsById } from "@/lib/format";
import { pageHead } from "@/lib/route-head";
import type { Severity } from "@/types";
import type { FloodHotspot } from "@/types/api";

export const Route = createFileRoute("/enchentes")({
  head: pageHead(
    "Enchentes e Resposta Rápida",
    "Chuva prevista (real) ou tempestade simulada sobre o relevo real de Ribeirão Preto: onde e quando a drenagem falha.",
  ),
  component: FloodPage,
});

const MAP_TABS = [
  { id: "risk", label: "Risco de alagamento" },
  { id: "terrain", label: "Relevo (suscetibilidade)" },
  { id: "drainage", label: "Drenagem" },
] as const;
type MapTab = (typeof MAP_TABS)[number]["id"];

const LAYERS: LayerOption[] = [
  { id: "streams", label: "Córregos e galerias", on: true },
  { id: "facilities", label: "Infraestrutura crítica", on: true },
  { id: "sensors", label: "Pluviômetros e réguas", on: true },
  { id: "sectors", label: "Setores", on: false },
  { id: "network", label: "Rede de água", on: false },
];

const TAB_LAYERS: Record<MapTab, Partial<Record<MapLayerKey, boolean>>> = {
  risk: { flood: true, susceptibility: false },
  terrain: { flood: false, susceptibility: true },
  drainage: { flood: false, susceptibility: false, streams: true },
};

const MODES = [
  { id: "real", label: "Previsão real" },
  { id: "extreme", label: "Tempestade simulada" },
] as const;

function levelOf(ratio: number): Severity {
  if (ratio >= 1.25) return "critical";
  if (ratio >= 1) return "high";
  if (ratio >= 0.8) return "attention";
  return "normal";
}

const FRAME_MS = 750;

function FloodPage() {
  const scenario = useScenario();
  const flood = useFlood(scenario.rainMode);
  const live = useLive(scenario.rainMode, scenario.installed);
  const base = useMapBase();
  const decisions = useDecisions(scenario.rainMode, scenario.installed);
  const [tab, setTab] = useState<MapTab>("risk");
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const pendingRun = useRef(false);

  // Ao trocar de modo, mantém a resposta anterior na tela até a nova chegar
  // (em vez de piscar o carregamento); `pending` sinaliza a troca.
  const data = flood.data;
  const pending = data !== undefined && data.mode !== scenario.rainMode;
  const frames = data?.frames ?? [];
  const frame = frameIndex !== null ? frames[frameIndex] : undefined;
  const animating = frameIndex !== null;

  const runSimulation = () => {
    setTab("risk");
    setAlertVisible(false);
    pendingRun.current = true;
    if (scenario.rainMode !== "extreme") scenario.setRainMode("extreme");
    else setFrameIndex(0);
  };

  // Quando a resposta da tempestade chega, a animação começa.
  useEffect(() => {
    if (pendingRun.current && data?.mode === "extreme" && !pending) {
      pendingRun.current = false;
      setFrameIndex(0);
    }
  }, [data, pending]);

  useEffect(() => {
    if (frameIndex === null) return;
    if (frameIndex >= frames.length - 1) {
      const done = window.setTimeout(() => {
        setFrameIndex(null);
        if (data?.summary.level === "critical" || data?.summary.level === "high") {
          setAlertVisible(true);
          toast.error("Risco crítico detectado.", { description: data.summary.headline });
        }
      }, 900);
      return () => window.clearTimeout(done);
    }
    const next = window.setTimeout(
      () => setFrameIndex((i) => (i === null ? null : i + 1)),
      FRAME_MS,
    );
    return () => window.clearTimeout(next);
  }, [frameIndex, frames.length, data]);

  useDemoCue("flood", runSimulation);

  const readings = useMemo(() => readingsById(live.data?.sensors), [live.data]);
  const floodSensors = (live.data?.sensors ?? []).filter(
    (s) => s.type === "rain" || s.type === "river",
  );

  const peak = Math.max(0.0001, ...frames.map((f) => f.maxRatio));
  const intensity = frame ? Math.min(1.15, frame.maxRatio / peak) : 1;

  const fields = useMemo<MapFieldSpec[]>(() => {
    if (!data) return [];
    return [
      {
        id: "flood",
        grid: data.risk,
        ramp: "risk",
        intensity,
        describe: (v) =>
          v < 0.08
            ? "Risco de alagamento: desprezível"
            : `Risco de alagamento: ${v < 0.35 ? "baixo" : v < 0.6 ? "moderado" : v < 0.8 ? "alto" : "crítico"} (${Math.round(v * 100)}%)`,
      },
      {
        id: "susceptibility",
        grid: data.susceptibility,
        ramp: "susceptibility",
        describe: (v) => `Suscetibilidade do relevo: ${Math.round(v * 100)}%`,
      },
    ];
  }, [data, intensity]);

  const hotspotLevel = (h: FloodHotspot): Severity =>
    frame ? levelOf(frame.hotspots[h.id] ?? 0) : h.level;

  const markers = useMemo<MapMarkerSpec[]>(
    () =>
      (data?.hotspots ?? []).map((h) => {
        const level = hotspotLevel(h);
        const ratio = frame ? (frame.hotspots[h.id] ?? 0) : h.peakRatio;
        return {
          id: h.id,
          lngLat: h.lngLat,
          level,
          kind: "alert" as const,
          label: h.name,
          detail:
            h.minutesToCritical !== null && !frame
              ? `crítico em ~${h.minutesToCritical} min`
              : `${Math.round(ratio * 100)}% da capacidade`,
          pulse: level === "critical",
          tooltip: (
            <>
              <header>
                <strong>{h.name}</strong>
                <span>
                  {h.stream} · {h.gallery}
                </span>
              </header>
              <div className="map-tip-reading">
                <b className={`level-${level}`}>
                  {Math.round(ratio * 100)}% <em>da capacidade</em>
                </b>
                <small>
                  pico {num(h.peakFlow)} m³/s · galeria {num(h.capacity)} m³/s
                </small>
              </div>
              <p>
                <span>Bacia:</span> {num(h.catchmentKm2)} km² · tempo de concentração {h.tcMinutes}{" "}
                min
              </p>
              {h.facilities.length > 0 && (
                <p>
                  <span>Perto:</span> {h.facilities.map((f) => f.name).join(", ")}
                </p>
              )}
              <footer>
                <span className="map-tip-origin origin-misto">Via real · hidrologia do modelo</span>
              </footer>
            </>
          ),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, frame],
  );

  const forecastChart = useMemo(
    () =>
      !data
        ? []
        : data.mode === "extreme"
          ? data.forecast
          : data.forecast.filter((_, i) => i % 4 === 0),
    [data],
  );

  const riverChart = useMemo(() => {
    const rivers = data?.rivers ?? [];
    const first = rivers[0];
    if (!first) return [];
    return first.series.map((point, i) => {
      const row: Record<string, string | number | null> = { time: point.time };
      rivers.forEach((river, r) => {
        const p = river.series[i];
        row[`r${r}`] = p ? (p.level ?? p.projected) : null;
      });
      return row;
    });
  }, [data]);

  const summary = data?.summary;
  const rainShown = frame ? frame.rainAccum : (summary?.rain3h ?? 0);
  const floodActions = (decisions.data?.decisions ?? []).filter((d) => d.module === "enchentes");
  const riverColors = ["var(--ag-cyan)", "var(--ag-blue)", "var(--ag-teal)"];

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>
            {pending
              ? "Recalculando a hidrologia…"
              : data
                ? data.mode === "extreme"
                  ? animating
                    ? `Tempestade simulada · minuto ${frame?.minute ?? 0} · ${num(frame?.rainAccum ?? 0)} mm acumulados`
                    : "Tempestade simulada · 74 mm em 3 h sobre o relevo real"
                  : `Previsão real ${data.weatherSource === "open-meteo" ? "Open-Meteo" : "(climatologia)"} · próximas 24 h`
                : "Carregando previsão…"}
          </LiveTag>
        </div>
        <div className="toolbar-right">
          <SegmentedControl
            options={MODES}
            value={scenario.rainMode}
            onChange={(mode) => {
              setFrameIndex(null);
              setAlertVisible(false);
              scenario.setRainMode(mode);
            }}
            size="sm"
          />
          {scenario.rainMode === "extreme" && !animating ? (
            <Button variant="outline" size="sm" onClick={runSimulation}>
              <RotateCcw />
              Reproduzir tempestade
            </Button>
          ) : (
            <Button variant="operational" size="sm" onClick={runSimulation} disabled={animating}>
              <CloudLightning />
              {animating
                ? `Chovendo · ${num(frame?.rainAccum ?? 0, 0)} mm`
                : "Simular chuva extrema"}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {alertVisible && summary && (
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
              <strong>Risco crítico detectado</strong>
              <p>{summary.headline}</p>
            </div>
            <div className="alert-banner-actions">
              <Button
                size="sm"
                variant="operational"
                onClick={() =>
                  document.getElementById("acoes-enchente")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Ver ações
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

      <StoryBanner
        icon={CloudRain}
        level={frame ? frame.level : (summary?.level ?? "info")}
        title={
          data?.mode === "extreme"
            ? "Tempestade extrema simulada sobre a drenagem real"
            : summary && summary.level !== "normal"
              ? "Chuva prevista pode sobrecarregar a drenagem"
              : "Sem risco hidrológico relevante nas próximas 24 h"
        }
        aside={
          <>
            <OriginBadge
              origin={data?.mode === "extreme" ? "simulado" : "real"}
              label={data?.mode === "extreme" ? "Chuva simulada" : "Previsão real"}
            />
            <OriginBadge origin="modelo" label="Hidrologia" />
          </>
        }
      >
        {summary?.headline ?? "Lendo a previsão de chuva…"} O modelo aplica o{" "}
        <Term explain="racional">método racional</Term> a cada ponto crítico, com o{" "}
        <Term explain="tc">tempo de concentração</Term> calculado pelo relevo real.
      </StoryBanner>

      <KpiStrip>
        <KpiCard
          icon={CloudRain}
          label={data?.mode === "extreme" ? "Chuva acumulada" : "Chuva prevista (3 h)"}
          origin={data?.mode === "extreme" ? "simulado" : "real"}
          value={num(rainShown, 1)}
          unit="mm"
          hint={
            summary
              ? `${num(summary.rain24h, 0)} mm em 24 h · pico ${num(summary.peakIntensity, 0)} mm/h`
              : ""
          }
          tone="blue"
          progress={Math.min(100, (rainShown / 74) * 100)}
        />
        <KpiCard
          icon={TriangleAlert}
          label="Risco hidrológico"
          info="capacidade"
          origin="modelo"
          value={
            (frame ? frame.level : summary?.level) === "critical"
              ? "CRÍTICO"
              : (frame ? frame.level : summary?.level) === "high"
                ? "ALTO"
                : (frame ? frame.level : summary?.level) === "attention"
                  ? "ATENÇÃO"
                  : "BAIXO"
          }
          hint={
            frame
              ? `drenagem a ${Math.round(frame.maxRatio * 100)}% da capacidade`
              : summary
                ? `pico a ${Math.round((data?.hotspots[0]?.peakRatio ?? 0) * 100)}% da capacidade`
                : ""
          }
          tone={
            (frame ? frame.level : summary?.level) === "critical"
              ? "critical"
              : (frame ? frame.level : summary?.level) === "high"
                ? "high"
                : "teal"
          }
        />
        <KpiCard
          icon={MapPinned}
          label="Pontos em risco"
          origin="modelo"
          value={String(
            frame
              ? Object.values(frame.hotspots).filter((r) => r >= 0.8).length
              : (summary?.pointsAtRisk ?? 0),
          )}
          unit={`de ${data?.hotspots.length ?? 5}`}
          hint="vias reais junto a córregos"
          tone="high"
        />
        <KpiCard
          icon={Clock}
          label="Tempo até nível crítico"
          info="tc"
          origin="modelo"
          value={
            summary?.minutesToFirstCritical !== null &&
            summary?.minutesToFirstCritical !== undefined
              ? String(summary.minutesToFirstCritical)
              : "—"
          }
          unit={
            summary?.minutesToFirstCritical !== null &&
            summary?.minutesToFirstCritical !== undefined
              ? "min"
              : undefined
          }
          hint={
            summary?.minutesToFirstCritical
              ? (data?.hotspots.find((h) => h.minutesToCritical === summary.minutesToFirstCritical)
                  ?.name ?? "")
              : "nenhum ponto chega ao crítico"
          }
          tone="warning"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Monitor hidrológico"
            info="suscetibilidade"
            hint="relevo Copernicus · córregos OSM"
            action={
              <>
                <SegmentedControl
                  options={MAP_TABS}
                  value={tab}
                  onChange={(id) => setTab(id)}
                  size="sm"
                />
                <StatusBadge level={frame ? frame.level : (summary?.level ?? "normal")}>
                  {num(rainShown, 0)} mm
                </StatusBadge>
              </>
            }
          />
          {base.data ? (
            <OpsMap
              base={base.data}
              layers={LAYERS}
              forceLayers={TAB_LAYERS[tab]}
              readings={readings}
              fields={fields}
              markers={markers}
              legend={
                tab === "terrain"
                  ? {
                      title: "Suscetibilidade do relevo",
                      gradient: ["rgba(56,189,248,0.2)", "#22d3ee", "#14b8a6"],
                      ticks: ["Baixa", "Alta"],
                    }
                  : {
                      title: "Risco de alagamento",
                      gradient: ["#38bdf8", "#f59e0b", "#f97316", "#ef4444"],
                      ticks: ["Baixo", "Moderado", "Alto", "Crítico"],
                    }
              }
            />
          ) : (
            <LoadingBlock height={520} label="Carregando mapa…" />
          )}
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Pontos críticos priorizados"
              icon={Waves}
              hint={data ? `${data.hotspots.length} monitorados` : ""}
            />
            <ul className="hotspot-list">
              {(data?.hotspots ?? []).map((h) => {
                const level = hotspotLevel(h);
                const ratio = frame ? (frame.hotspots[h.id] ?? 0) : h.peakRatio;
                return (
                  <li key={h.id} className={`level-${level}`}>
                    <span className="hotspot-icon">
                      <TriangleAlert />
                    </span>
                    <span className="hotspot-main">
                      <strong>{h.name}</strong>
                      <small>
                        {h.stream}
                        {h.facilities[0] ? ` · perto de ${h.facilities[0].name}` : ""}
                      </small>
                      <span className="pipe-bar">
                        <i style={{ width: `${Math.min(100, ratio * 70)}%` }} />
                      </span>
                    </span>
                    <span className="hotspot-metric">
                      <small>{h.minutesToCritical !== null ? "crítico em" : "pico"}</small>
                      <b>
                        {h.minutesToCritical !== null
                          ? `${h.minutesToCritical} min`
                          : `${Math.round(ratio * 100)}%`}
                      </b>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </aside>
      </div>

      {/* 01 — Dados coletados */}
      <StorySection>
        <SectionHeading
          index={1}
          title="Dados coletados"
          description="Chuva (prevista ou simulada), pluviômetros e réguas de nível nos córregos"
          aside={
            <>
              <OriginBadge
                origin={data?.mode === "extreme" ? "simulado" : "real"}
                label={data?.mode === "extreme" ? "Chuva simulada" : "Chuva real"}
              />
              <OriginBadge origin="simulado" label="Réguas simuladas" />
            </>
          }
        />
        {floodSensors.length > 0 && <SensorGrid readings={floodSensors} base={base.data} />}
        <div className="grid-2">
          <Panel>
            <PanelHeader
              title={data?.mode === "extreme" ? "Chuva da tempestade simulada" : "Chuva prevista"}
              hint={
                data?.mode === "extreme" ? "distribuição de Huff · 15 min" : "Open-Meteo · 15 min"
              }
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
              {data ? (
                <ChartFrame height={200}>
                  <ComposedChart data={forecastChart} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="time" interval={data.mode === "extreme" ? 2 : 3} {...AXIS} />
                    <YAxis yAxisId="i" {...AXIS_Y} width={36} />
                    <YAxis yAxisId="a" orientation="right" {...AXIS_Y} width={36} />
                    <Tooltip
                      content={<AgTooltip decimals={1} />}
                      cursor={{ fill: "oklch(0.8276 0.1013 230.32 / 0.06)" }}
                    />
                    <Bar
                      yAxisId="i"
                      dataKey="intensity"
                      name="Intensidade (mm/h)"
                      fill="var(--ag-blue)"
                      fillOpacity={0.5}
                      radius={[3, 3, 0, 0]}
                      barSize={data.mode === "extreme" ? 12 : 8}
                    />
                    <Line
                      yAxisId="a"
                      type="monotone"
                      dataKey="accumulated"
                      name="Acumulado (mm)"
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
                {data?.mode === "extreme"
                  ? "Tempestade de projeto: 74 mm em 3 h, com mais da metade da chuva nos primeiros 45 minutos — o padrão dos temporais de verão."
                  : "Previsão horária real para Ribeirão Preto. Chuva acima de ~40 mm/h começa a exceder a capacidade das galerias mais críticas."}
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Nível dos córregos"
              hint="réguas a montante dos pontos críticos"
              action={
                <ChartLegend
                  items={(data?.rivers ?? []).map((r, i) => ({
                    label: `${r.sensorId} · ${r.stream}`,
                    color: riverColors[i] ?? "var(--ag-cyan)",
                  }))}
                />
              }
            />
            <PanelBody>
              {data ? (
                <ChartFrame height={200}>
                  <LineChart data={riverChart} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="time" interval={3} {...AXIS} />
                    <YAxis domain={[0, 4]} unit=" m" {...AXIS_Y} width={44} />
                    <ReferenceLine
                      y={data.rivers[0]?.alert ?? 2.6}
                      stroke="var(--ag-warning)"
                      strokeDasharray="5 4"
                      label={{
                        value: "alerta",
                        position: "insideTopLeft",
                        fill: "var(--ag-warning)",
                        fontSize: 9,
                      }}
                    />
                    <ReferenceLine
                      y={data.rivers[0]?.flood ?? 3.2}
                      stroke="var(--ag-critical)"
                      strokeDasharray="5 4"
                      label={{
                        value: "inundação",
                        position: "insideTopLeft",
                        fill: "var(--ag-critical)",
                        fontSize: 9,
                      }}
                    />
                    <Tooltip
                      content={
                        <AgTooltip
                          unit=" m"
                          decimals={2}
                          caption="Passado: medido · futuro: projeção"
                        />
                      }
                    />
                    {(data.rivers ?? []).map((river, i) => (
                      <Line
                        key={river.sensorId}
                        type="monotone"
                        dataKey={`r${i}`}
                        name={`${river.sensorId} · ${river.stream}`}
                        stroke={riverColors[i] ?? "var(--ag-cyan)"}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartFrame>
              ) : (
                <LoadingBlock height={200} />
              )}
              <p className="section-note">
                Seis horas medidas e seis projetadas. A régua antecipa o transbordamento comparando
                a lâmina com as cotas de alerta e de inundação.
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
          description="Para cada ponto: bacia real, tempo de concentração, capacidade da galeria e vazão de pico prevista"
          aside={<OriginBadge origin="modelo" />}
        />
        <Panel flush>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ponto crítico</th>
                <th>Córrego</th>
                <th className="is-numeric">
                  Bacia
                  <InfoTip explain="racional" />
                </th>
                <th className="is-numeric">
                  T. concentração
                  <InfoTip explain="tc" />
                </th>
                <th className="is-numeric">
                  Capacidade
                  <InfoTip explain="capacidade" />
                </th>
                <th className="is-numeric">Pico previsto</th>
                <th className="is-numeric">Uso da galeria</th>
                <th>Situação</th>
                <th>Infraestrutura próxima</th>
              </tr>
            </thead>
            <tbody>
              {(data?.hotspots ?? []).map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.name}</strong>
                    <small>{h.gallery}</small>
                  </td>
                  <td>{h.stream}</td>
                  <td className="is-numeric">{num(h.catchmentKm2)} km²</td>
                  <td className="is-numeric">{h.tcMinutes} min</td>
                  <td className="is-numeric">{num(h.capacity)} m³/s</td>
                  <td className="is-numeric">{num(h.peakFlow)} m³/s</td>
                  <td className="is-numeric">
                    <span
                      className={`text-${h.level === "critical" ? "critical" : h.level === "high" ? "high" : h.level === "attention" ? "warning" : "success"}`}
                    >
                      {Math.round(h.peakRatio * 100)}%
                    </span>
                  </td>
                  <td>
                    <StatusBadge level={h.level}>
                      {h.minutesToCritical !== null
                        ? `crítico em ${h.minutesToCritical} min`
                        : undefined}
                    </StatusBadge>
                  </td>
                  <td>
                    <small className="facility-list">
                      {h.facilities.length
                        ? h.facilities.map((f) => `${f.name} (${num(f.distance, 0)} m)`).join(" · ")
                        : "—"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </StorySection>

      {/* 03 — Ações */}
      <StorySection>
        <div id="acoes-enchente" />
        <SectionHeading
          index={3}
          title="Ações recomendadas"
          description={
            data?.mode === "extreme"
              ? "Resposta coordenada antes do pico"
              : "Prevenção enquanto o tempo está firme"
          }
        />
        <Panel flush>
          {floodActions.length > 0 ? (
            <ActionList
              numbered={false}
              items={floodActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                priority: action.priority,
                level: action.level,
                time: action.horizon,
                impact: action.impact,
                module: "enchentes" as const,
              }))}
            />
          ) : (
            <p className="empty-hint">
              {decisions.isLoading ? "Carregando…" : "Nenhuma ação necessária."}
            </p>
          )}
        </Panel>
      </StorySection>
    </div>
  );
}
