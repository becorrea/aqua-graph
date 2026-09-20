/**
 * Mapa operacional de Ribeirão das Águas.
 *
 * Renderiza a cartografia sintética de `cityGeometry` em SVG, com controle de
 * camadas, zoom/pan e sobreposições analíticas por módulo. Não depende de
 * serviço externo de tiles — a cidade inteira é vetorial.
 *
 * Decisões de renderização que importam:
 * - infraestrutura usa `vector-effect="non-scaling-stroke"`, então as linhas
 *   mantêm espessura constante ao ampliar, como em software GIS;
 * - rótulos e marcadores são contra-escalados (`scale(1/zoom)`) para não
 *   crescerem com o mapa;
 * - os heatmaps são construídos com elipses sólidas empilhadas sob um filtro de
 *   blur, revelando faixas de severidade conforme a intensidade sobe.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Layers, Locate, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { severityColor } from "@/lib/severity";
import {
  MAP,
  canalPaths,
  cityBoundaryPath,
  contourPaths,
  expresswayPaths,
  ringRoadPath,
  riverPath,
  sectorGeometry,
  streetLayers,
  tributaryPath,
  urbanBlocksPath,
  waterBodies,
} from "@/data/cityGeometry";
import {
  criticalFacilities,
  distributionNetwork,
  drainageNetwork,
  mapLayerCatalog,
  priorityPipes,
  pumpStations,
  trunkMains,
  valves,
  type MapLayerId,
  type MapVariant,
} from "@/data/waterNetwork";
import { sectorProfileById, watchedSectors } from "@/data/city";
import { reservoirs } from "@/data/reservoirs";
import { droughtLegend, droughtLevel } from "@/data/droughtScenarios";
import {
  COVERAGE_RADIUS,
  sensorRecommendation,
  sensors,
  uncertaintyZones,
  type SensingView,
} from "@/data/sensors";
import { floodHeatCores } from "@/data/floodEvents";
import type { MapMarker, Severity } from "@/types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Faixas do heatmap. Conforme `intensity` cresce, faixas mais severas surgem
 * com raio menor — o mesmo comportamento de um mapa de calor interpolado.
 */
/**
 * Cada faixa é um gradiente radial completo (quente no núcleo, frio na borda,
 * transparente na franja). Faixas mais severas entram sobrepostas conforme
 * `intensity` cresce, o que preserva o tecido urbano visível sob o mapa de calor
 * — ao contrário de manchas chapadas, que apagam a base cartográfica.
 */
const HEAT_STAGES = [
  {
    id: "blue",
    from: 0,
    stops: [
      { at: 0, color: "var(--ag-blue)", alpha: 0.3 },
      { at: 62, color: "var(--ag-blue)", alpha: 0.14 },
      { at: 100, color: "var(--ag-blue)", alpha: 0 },
    ],
  },
  {
    id: "teal",
    from: 0.16,
    stops: [
      { at: 0, color: "var(--ag-teal)", alpha: 0.34 },
      { at: 48, color: "var(--ag-teal)", alpha: 0.16 },
      { at: 100, color: "var(--ag-teal)", alpha: 0 },
    ],
  },
  {
    id: "warning",
    from: 0.4,
    stops: [
      { at: 0, color: "var(--ag-warning)", alpha: 0.44 },
      { at: 36, color: "var(--ag-warning)", alpha: 0.2 },
      { at: 78, color: "var(--ag-warning)", alpha: 0 },
    ],
  },
  {
    id: "high",
    from: 0.62,
    stops: [
      { at: 0, color: "var(--ag-high)", alpha: 0.5 },
      { at: 26, color: "var(--ag-high)", alpha: 0.24 },
      { at: 58, color: "var(--ag-high)", alpha: 0 },
    ],
  },
  {
    id: "critical",
    from: 0.82,
    stops: [
      { at: 0, color: "var(--ag-critical)", alpha: 0.62 },
      { at: 18, color: "var(--ag-critical)", alpha: 0.32 },
      { at: 40, color: "var(--ag-critical)", alpha: 0 },
    ],
  },
];

export type HeatCore = { x: number; y: number; rx: number; ry: number; weight: number };

export type MapLegendConfig = {
  title: string;
  gradient?: string[];
  ticks?: string[];
  swatches?: Array<{ level: Severity; label: string }>;
};

const HEAT_GRADIENT = [
  "var(--ag-blue)",
  "var(--ag-teal)",
  "var(--ag-cyan)",
  "var(--ag-warning)",
  "var(--ag-high)",
  "var(--ag-critical)",
];

const DEFAULT_LEGEND: Record<MapVariant, MapLegendConfig> = {
  overview: {
    title: "Severidade operacional",
    swatches: [
      { level: "normal", label: "Normal" },
      { level: "attention", label: "Atenção" },
      { level: "high", label: "Alto" },
      { level: "critical", label: "Crítico" },
    ],
  },
  leaks: {
    title: "Probabilidade de vazamento",
    gradient: HEAT_GRADIENT,
    ticks: ["Baixa", "Alta"],
  },
  drought: { title: "Risco de estiagem", swatches: droughtLegend },
  flood: {
    title: "Nível de risco",
    gradient: HEAT_GRADIENT,
    ticks: ["Baixo", "Moderado", "Alto", "Crítico"],
  },
  sensing: {
    title: "Cobertura informacional",
    gradient: ["var(--ag-critical)", "var(--ag-warning)", "var(--ag-teal)", "var(--ag-cyan)"],
    ticks: ["Baixa", "Alta"],
  },
};

type CityMapProps = {
  variant?: MapVariant;
  /** 0–1: dosagem dos heatmaps, animada durante as simulações. */
  intensity?: number;
  selectedSector?: string | null;
  onSelectSector?: (sectorId: string) => void;
  markers?: MapMarker[];
  highlightPipes?: string[];
  sensingView?: SensingView;
  sensorInstalled?: boolean;
  /** Força camadas ligadas/desligadas — usado pelas abas de cada módulo. */
  overrideLayers?: Partial<Record<MapLayerId, boolean>>;
  legend?: MapLegendConfig | null;
  /** `featured` mostra pílulas nos setores monitorados; `codes`, apenas o código. */
  sectorLabels?: "featured" | "codes" | "none";
  tabs?: ReadonlyArray<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  chrome?: boolean;
  compact?: boolean;
  className?: string;
};

export function CityMap({
  variant = "overview",
  intensity = 1,
  selectedSector = null,
  onSelectSector,
  markers = [],
  highlightPipes = [],
  sensingView = "coverage",
  sensorInstalled = false,
  overrideLayers,
  legend,
  sectorLabels = "featured",
  tabs,
  activeTab,
  onTabChange,
  chrome = true,
  compact = false,
  className,
}: CityMapProps) {
  const catalog = mapLayerCatalog[variant];
  const [active, setActive] = useState<Set<MapLayerId>>(
    () => new Set(catalog.filter((layer) => layer.on).map((layer) => layer.id)),
  );
  const [layersOpen, setLayersOpen] = useState(!compact);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  const has = (layer: MapLayerId) => overrideLayers?.[layer] ?? active.has(layer);
  const toggle = (layer: MapLayerId) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const clampOffset = (value: number, axis: "x" | "y", zoom: number) => {
    const size = axis === "x" ? MAP.width : MAP.height;
    return Math.min(0, Math.max(size * (1 - zoom), value));
  };

  const zoomBy = (factor: number) =>
    setView((current) => {
      const zoom = Math.min(4, Math.max(1, current.zoom * factor));
      const cx = MAP.width / 2;
      const cy = MAP.height / 2;
      const x = cx - ((cx - current.x) * zoom) / current.zoom;
      const y = cy - ((cy - current.y) * zoom) / current.zoom;
      return { zoom, x: clampOffset(x, "x", zoom), y: clampOffset(y, "y", zoom) };
    });

  const pixelsPerUnit = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return 1;
    return Math.max(rect.width / MAP.width, rect.height / MAP.height);
  };

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (view.zoom === 1) return;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: view.x, y: view.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const ratio = pixelsPerUnit() * view.zoom;
    const x = drag.x + (event.clientX - drag.pointerX) / ratio;
    const y = drag.y + (event.clientY - drag.pointerY) / ratio;
    setView((current) => ({
      ...current,
      x: clampOffset(x, "x", current.zoom),
      y: clampOffset(y, "y", current.zoom),
    }));
  };

  const endPan = () => {
    dragRef.current = null;
  };

  const leakCores = useMemo<HeatCore[]>(
    () =>
      sectorGeometry
        .map((sector) => {
          const profile = sectorProfileById.get(sector.id);
          if (!profile || profile.leakProbability < 50) return null;
          const radius = 58 + profile.leakProbability * 0.92;
          return {
            x: sector.centroid.x,
            y: sector.centroid.y,
            rx: radius,
            ry: radius * 0.82,
            weight: profile.leakProbability / 100,
          };
        })
        .filter((core): core is HeatCore => core !== null),
    [],
  );

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 1) return [];
    const options = [
      ...sectorGeometry.map((sector) => ({
        id: sector.id,
        label: `Setor ${sector.id}`,
        detail: sector.district,
      })),
      ...reservoirs.map((item) => ({ id: item.id, label: item.name, detail: "Reservatório" })),
      ...pumpStations.map((item) => ({ id: item.id, label: item.label, detail: item.detail })),
      ...criticalFacilities.map((item) => ({ id: item.id, label: item.label, detail: item.kind })),
    ];
    return options
      .filter(
        (option) =>
          option.label.toLowerCase().includes(term) || option.detail.toLowerCase().includes(term),
      )
      .slice(0, 5);
  }, [query]);

  const resolvedLegend = legend === undefined ? DEFAULT_LEGEND[variant] : legend;
  const showSectors = has("sectors") || has("drought-risk");
  const heatIntensity = clamp01(intensity);
  const counterScale = 1 / view.zoom;

  return (
    <div
      ref={frameRef}
      className={cn("ops-map", compact && "ops-map-compact", `ops-map-${variant}`, className)}
    >
      <svg
        viewBox={`0 0 ${MAP.width} ${MAP.height}`}
        preserveAspectRatio="xMidYMid slice"
        className={cn(view.zoom > 1 && "is-pannable")}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        role="img"
        aria-label={`Mapa operacional de Ribeirão das Águas — camada ${variant}`}
      >
        <defs>
          <linearGradient id="ag-map-base" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="var(--ag-bg-soft)" />
            <stop offset="100%" stopColor="var(--ag-bg-deep)" />
          </linearGradient>
          <linearGradient id="ag-river" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ag-blue)" />
            <stop offset="100%" stopColor="var(--ag-teal)" />
          </linearGradient>
          {HEAT_STAGES.map((stage, index) => (
            <radialGradient key={stage.id} id={`ag-heat-${index}`}>
              {stage.stops.map((stop) => (
                <stop
                  key={stop.at}
                  offset={`${stop.at}%`}
                  stopColor={stop.color}
                  stopOpacity={stop.alpha}
                />
              ))}
            </radialGradient>
          ))}
          <filter id="ag-heat-blur" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="17" />
          </filter>
          <filter id="ag-soft-blur" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="ag-line-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="ag-city-clip">
            <path d={cityBoundaryPath} />
          </clipPath>
        </defs>

        <rect width={MAP.width} height={MAP.height} fill="url(#ag-map-base)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* Entorno: a malha continua além da divisa, em baixa intensidade, para
              que o enquadramento não termine em vazio. */}
          <g className="map-outskirts">
            <path className="map-street map-street-secondary" d={streetLayers.secondary} />
            <path className="map-street map-street-arterial" d={streetLayers.arterial} />
          </g>

          {/* Mancha urbana: tecido de quadras e malha viária, recortados no
              limite do município. */}
          <g clipPath="url(#ag-city-clip)">
            <path className="map-urban-area" d={cityBoundaryPath} />
            <path className="map-blocks" d={urbanBlocksPath} />
            <path className="map-street map-street-local" d={streetLayers.local} />
            <path className="map-street map-street-secondary" d={streetLayers.secondary} />
            <path className="map-street map-street-arterial" d={streetLayers.arterial} />
            <path className="map-street map-street-ring" d={ringRoadPath} />
            {expresswayPaths.map((d, index) => (
              <path key={index} className="map-street map-street-express" d={d} />
            ))}
          </g>

          {has("topography") && (
            <g className="map-contours">
              {contourPaths.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </g>
          )}

          {/* Hidrografia */}
          <g className="map-hydrography">
            {waterBodies.map((d, index) => (
              <path key={index} className="map-water-body" d={d} />
            ))}
            {has("river-level") && (
              <>
                <path className="map-river-flood" d={riverPath} />
                <path className="map-river-flood" d={tributaryPath} />
              </>
            )}
            <path className="map-river-bed" d={riverPath} />
            <path className="map-river" d={riverPath} />
            <path className="map-river-bed map-tributary-bed" d={tributaryPath} />
            <path className="map-river map-tributary" d={tributaryPath} />
            {canalPaths.map((d, index) => (
              <path key={index} className="map-canal" d={d} />
            ))}
          </g>

          {/* Setores de abastecimento */}
          {showSectors && (
            <g className="map-sectors">
              {sectorGeometry.map((sector) => {
                const profile = sectorProfileById.get(sector.id);
                const isDrought = variant === "drought" && has("drought-risk");
                const level: Severity | null = isDrought
                  ? droughtLevel(profile?.daysToCriticality ?? 90)
                  : null;
                return (
                  <path
                    key={sector.id}
                    d={sector.path}
                    className={cn(
                      "map-sector",
                      selectedSector === sector.id && "is-selected",
                      onSelectSector && "is-clickable",
                      level && `fill-${level}`,
                    )}
                    onClick={() => onSelectSector?.(sector.id)}
                  >
                    <title>{`Setor ${sector.id} — ${sector.district}`}</title>
                  </path>
                );
              })}
            </g>
          )}

          {/* Sobreposições analíticas */}
          {/* O radar entra primeiro: é contexto meteorológico e não pode lavar
              as faixas de risco calculadas pelo modelo. */}
          {has("rain-radar") && (
            <g className="map-rain-radar" filter="url(#ag-heat-blur)">
              <ellipse cx="330" cy="240" rx="240" ry="176" />
              <ellipse cx="560" cy="300" rx="208" ry="156" />
              <ellipse cx="180" cy="420" rx="164" ry="128" />
            </g>
          )}
          {has("leak-probability") && <HeatField cores={leakCores} intensity={heatIntensity} />}
          {has("flood-risk") && <HeatField cores={floodHeatCores} intensity={heatIntensity} />}
          {has("pressure") && (
            <g className="map-pressure-field" filter="url(#ag-soft-blur)">
              {sectorGeometry.map((sector) => {
                const profile = sectorProfileById.get(sector.id);
                if (!profile) return null;
                const deficit = Math.abs(profile.pressureVariation);
                if (deficit < 3) return null;
                return (
                  <ellipse
                    key={sector.id}
                    cx={sector.centroid.x}
                    cy={sector.centroid.y}
                    rx={70 + deficit * 6}
                    ry={58 + deficit * 5}
                    opacity={0.1 + deficit * 0.03}
                  />
                );
              })}
            </g>
          )}
          {has("consumption") && (
            <g className="map-consumption">
              {sectorGeometry.map((sector) => {
                const profile = sectorProfileById.get(sector.id);
                if (!profile) return null;
                return (
                  <circle
                    key={sector.id}
                    cx={sector.centroid.x}
                    cy={sector.centroid.y}
                    r={Math.sqrt(profile.connections) / 7}
                  />
                );
              })}
            </g>
          )}

          {has("coverage") && (
            <g className="map-coverage" filter="url(#ag-heat-blur)">
              {sensors.map((sensor) => (
                <circle key={sensor.id} cx={sensor.x} cy={sensor.y} r={COVERAGE_RADIUS} />
              ))}
              {sensorInstalled && (
                <circle
                  className="map-coverage-new"
                  cx={sensorRecommendation.x}
                  cy={sensorRecommendation.y}
                  r={COVERAGE_RADIUS * 1.18}
                />
              )}
            </g>
          )}
          {has("uncertainty") && (
            <g className="map-uncertainty" filter="url(#ag-heat-blur)">
              {uncertaintyZones.map((zone) => (
                <ellipse
                  key={zone.id}
                  cx={zone.x}
                  cy={zone.y}
                  rx={zone.rx}
                  ry={zone.ry}
                  style={{ fill: severityColor[zone.level] }}
                  opacity={sensorInstalled && zone.id === "U-01" ? 0.12 : 0.42}
                />
              ))}
            </g>
          )}

          {/* Redes */}
          {has("drainage") && (
            <g className="map-drainage">
              {drainageNetwork.mains.map((d, index) => (
                <path key={`main-${index}`} className="map-drain-main" d={d} />
              ))}
              {drainageNetwork.laterals.map((d, index) => (
                <path key={`lat-${index}`} className="map-drain-lateral" d={d} />
              ))}
            </g>
          )}

          {has("network") && (
            <g className="map-network" clipPath="url(#ag-city-clip)">
              <path className="map-pipe map-pipe-secondary" d={distributionNetwork.secondary} />
              <path className="map-pipe map-pipe-primary" d={distributionNetwork.primary} />
              {trunkMains.map((main) => (
                <path key={main.id} className="map-pipe map-pipe-trunk" d={main.d}>
                  <title>{`${main.label} · ${main.diameter}`}</title>
                </path>
              ))}
            </g>
          )}

          {highlightPipes.length > 0 && (
            <g className="map-priority-pipes">
              {priorityPipes
                .filter((pipe) => highlightPipes.includes(pipe.id))
                .map((pipe, index) => (
                  <path
                    key={pipe.id}
                    d={pipe.d}
                    className={cn(index === 0 && "is-top")}
                    style={{ stroke: severityColor[index === 0 ? "critical" : "high"] }}
                  >
                    <title>{`${pipe.label} · ${pipe.probability}%`}</title>
                  </path>
                ))}
            </g>
          )}

          {has("boundary") && <path className="map-boundary" d={cityBoundaryPath} />}

          {/* Ativos pontuais */}
          {has("network") && !compact && (
            <g className="map-valves">
              {valves.map((valve) => (
                <g key={valve.id} transform={`translate(${valve.x} ${valve.y})`}>
                  <rect
                    className={cn("map-valve", `level-${valve.level}`)}
                    x="-3.2"
                    y="-3.2"
                    width="6.4"
                    height="6.4"
                    transform="rotate(45)"
                  >
                    <title>{`${valve.id} — ${valve.detail}`}</title>
                  </rect>
                </g>
              ))}
              {pumpStations.map((pump) => (
                <g key={pump.id} transform={`translate(${pump.x} ${pump.y})`}>
                  <circle className={cn("map-pump", `level-${pump.level}`)} r="5.4">
                    <title>{`${pump.id} — ${pump.detail}`}</title>
                  </circle>
                  <path className="map-pump-glyph" d="M-2.2 0H2.2M0 -2.2V2.2" />
                </g>
              ))}
            </g>
          )}

          {has("sensors") && (
            <g className="map-sensors">
              {sensors.map((sensor) => (
                <g key={sensor.id} transform={`translate(${sensor.x} ${sensor.y})`}>
                  <circle className={cn("map-sensor-halo", `level-${sensor.status}`)} r="8.5" />
                  <circle className={cn("map-sensor", `level-${sensor.status}`)} r="3.4">
                    <title>{`${sensor.id} · ${sensor.type} · ${sensor.reading}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          )}

          {has("reservoirs") && (
            <g className="map-reservoirs">
              {reservoirs.map((reservoir) => (
                <g
                  key={reservoir.id}
                  transform={`translate(${reservoir.x} ${reservoir.y}) scale(${counterScale})`}
                >
                  <rect className="map-reservoir" x="-9" y="-9" width="18" height="18" rx="3" />
                  <rect
                    className="map-reservoir-fill"
                    x="-9"
                    y={9 - (18 * reservoir.level) / 100}
                    width="18"
                    height={(18 * reservoir.level) / 100}
                    rx="2"
                  />
                  <text className="map-node-label" x="0" y="20">
                    {`${reservoir.name.replace("Reservatório ", "R. ")} ${reservoir.level}%`}
                  </text>
                  <title>{`${reservoir.name} · ${reservoir.level}% · ${reservoir.capacity}`}</title>
                </g>
              ))}
            </g>
          )}

          {has("critical-infra") && (
            <g className="map-facilities">
              {criticalFacilities.map((facility) => (
                <g
                  key={facility.id}
                  transform={`translate(${facility.x} ${facility.y}) scale(${counterScale})`}
                >
                  <circle className="map-facility" r="8" />
                  <path className="map-facility-glyph" d="M-3.4 0H3.4M0 -3.4V3.4" />
                  <title>{`${facility.kind} — ${facility.label}`}</title>
                </g>
              ))}
            </g>
          )}

          {has("recommendation") && (
            <g
              className={cn("map-recommendation", sensorInstalled && "is-installed")}
              transform={`translate(${sensorRecommendation.x} ${sensorRecommendation.y})`}
            >
              <circle className="map-recommendation-pulse" r="18" />
              <circle className="map-recommendation-ring" r="11" />
              <circle className="map-recommendation-core" r="4.6" />
              <g transform={`translate(0 0) scale(${counterScale})`}>
                <g className="map-callout" transform="translate(16 -10)">
                  <rect width="96" height="24" rx="5" />
                  <text className="map-callout-title" x="8" y="10">
                    {sensorInstalled
                      ? `${sensorRecommendation.id} instalado`
                      : sensorRecommendation.id}
                  </text>
                  <text className="map-callout-detail" x="8" y="19">
                    Setor {sensorRecommendation.sector}
                  </text>
                </g>
              </g>
            </g>
          )}

          {/* Rótulos e marcadores */}
          {showSectors && !compact && sectorLabels !== "none" && (
            <g className="map-sector-labels">
              {sectorGeometry.map((sector) => {
                const profile = sectorProfileById.get(sector.id);
                const featured =
                  selectedSector === sector.id ||
                  (sectorLabels === "featured" &&
                    (watchedSectors as readonly string[]).includes(sector.id));
                const level: Severity =
                  variant === "drought"
                    ? droughtLevel(profile?.daysToCriticality ?? 90)
                    : (profile?.level ?? "normal");
                const caption =
                  variant === "drought" ? `${profile?.daysToCriticality ?? "—"} dias` : null;
                return (
                  <SectorLabel
                    key={sector.id}
                    id={sector.id}
                    x={sector.centroid.x}
                    y={sector.centroid.y}
                    level={level}
                    caption={caption}
                    featured={featured}
                    selected={selectedSector === sector.id}
                    counterScale={counterScale}
                    onClick={onSelectSector ? () => onSelectSector(sector.id) : undefined}
                  />
                );
              })}
            </g>
          )}

          {markers.length > 0 && (
            <g className="map-markers">
              {markers.map((marker) => (
                <MapPin key={marker.id} marker={marker} counterScale={counterScale} />
              ))}
            </g>
          )}
        </g>
      </svg>

      {chrome && (
        <>
          <div className="map-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar endereço, setor ou ativo..."
              aria-label="Buscar no mapa"
            />
            {searchResults.length > 0 && (
              <ul className="map-search-results">
                {searchResults.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSector?.(result.id);
                        setQuery("");
                      }}
                    >
                      <strong>{result.label}</strong>
                      <span>{result.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {tabs && tabs.length > 0 && (
            <div className="map-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(tab.id === activeTab && "active")}
                  onClick={() => onTabChange?.(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="map-controls">
            <button type="button" onClick={() => zoomBy(1.4)} title="Ampliar">
              <Plus />
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.4)} title="Reduzir">
              <Minus />
            </button>
            <button
              type="button"
              onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
              title="Centralizar"
            >
              <Locate />
            </button>
          </div>

          <div className="map-compass">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2 L15 13 L12 11 L9 13 Z" />
            </svg>
            <b>N</b>
          </div>

          <div className={cn("map-layers", !layersOpen && "is-collapsed")}>
            <button
              className="map-layers-toggle"
              type="button"
              onClick={() => setLayersOpen((v) => !v)}
            >
              <Layers />
              <span>Camadas</span>
            </button>
            {layersOpen && (
              <ul>
                {catalog.map((layer) => (
                  <li key={layer.id}>
                    <button
                      type="button"
                      className={cn(has(layer.id) && "active")}
                      onClick={() => toggle(layer.id)}
                    >
                      <i>{has(layer.id) && <Check />}</i>
                      {layer.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {resolvedLegend && (
            <div className="map-legend">
              <span className="map-legend-title">{resolvedLegend.title}</span>
              {resolvedLegend.gradient && (
                <>
                  <div
                    className="map-legend-bar"
                    style={{
                      background: `linear-gradient(90deg, ${resolvedLegend.gradient.join(", ")})`,
                    }}
                  />
                  <div className="map-legend-ticks">
                    {resolvedLegend.ticks?.map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                </>
              )}
              {resolvedLegend.swatches && (
                <ul className="map-legend-swatches">
                  {resolvedLegend.swatches.map((swatch) => (
                    <li key={swatch.label}>
                      <i style={{ background: severityColor[swatch.level] }} />
                      {swatch.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="map-scale">
            <div className="map-scale-bar">
              <i />
              <i className="alt" />
              <i />
            </div>
            <div className="map-scale-ticks">
              <span>0</span>
              <span>2</span>
              <span>5 km</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes de mapa
// ---------------------------------------------------------------------------

function HeatField({ cores, intensity }: { cores: HeatCore[]; intensity: number }) {
  return (
    <g className="map-heat" filter="url(#ag-soft-blur)">
      {HEAT_STAGES.map((stage, index) => {
        const reveal = clamp01((intensity - stage.from) / 0.2);
        if (reveal <= 0) return null;
        return (
          <g key={stage.id} style={{ opacity: reveal }}>
            {cores.map((core, coreIndex) => (
              <ellipse
                key={coreIndex}
                cx={core.x}
                cy={core.y}
                rx={core.rx}
                ry={core.ry}
                fill={`url(#ag-heat-${index})`}
                opacity={core.weight}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function SectorLabel({
  id,
  x,
  y,
  level,
  caption,
  featured,
  selected,
  counterScale,
  onClick,
}: {
  id: string;
  x: number;
  y: number;
  level: Severity;
  caption: string | null;
  featured: boolean;
  selected: boolean;
  counterScale: number;
  onClick?: (() => void) | undefined;
}) {
  if (!featured) {
    return (
      <g transform={`translate(${x} ${y}) scale(${counterScale})`} className="map-sector-code">
        <text>{id}</text>
      </g>
    );
  }

  const label = `Setor ${id}`;
  const width = Math.max(label.length, (caption ?? "").length) * 5.5 + 18;
  const height = caption ? 26 : 17;

  return (
    <g
      transform={`translate(${x} ${y}) scale(${counterScale})`}
      className={cn(
        "map-sector-pill",
        `level-${level}`,
        selected && "is-selected",
        onClick && "is-clickable",
      )}
      onClick={onClick}
    >
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx="4" />
      <text x="0" y={caption ? -1 : 3.6}>
        {label}
      </text>
      {caption && (
        <text className="map-sector-pill-caption" x="0" y="9">
          {caption}
        </text>
      )}
    </g>
  );
}

function MapPin({ marker, counterScale }: { marker: MapMarker; counterScale: number }) {
  const color = severityColor[marker.level];
  const width = Math.max(marker.label.length, marker.detail.length) * 5.1 + 20;
  const flip = marker.x > MAP.width * 0.62;
  const calloutX = flip ? -(width + 15) : 15;

  return (
    <g
      className={cn(
        "map-pin",
        `level-${marker.level}`,
        marker.level === "critical" && "is-pulsing",
      )}
      transform={`translate(${marker.x} ${marker.y}) scale(${counterScale})`}
    >
      <circle className="map-pin-halo" r="15" style={{ fill: color }} />
      <circle className="map-pin-core" r="8.5" style={{ fill: color }} />
      {marker.kind === "facility" ? (
        <path className="map-pin-glyph" d="M-3.6 0H3.6M0 -3.6V3.6" />
      ) : (
        <>
          <path className="map-pin-glyph" d="M0 -4.2V1" />
          <circle className="map-pin-dot" cy="3.4" r="1.05" />
        </>
      )}
      <g className="map-callout" transform={`translate(${calloutX} -12)`}>
        <rect width={width} height="25" rx="5" />
        <text className="map-callout-title" x="8" y="10.5">
          {marker.label}
        </text>
        <text className="map-callout-detail" x="8" y="19.5" style={{ fill: color }}>
          {marker.detail}
        </text>
      </g>
      <title>{`${marker.label} — ${marker.detail}`}</title>
    </g>
  );
}
