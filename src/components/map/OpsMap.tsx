/**
 * Mapa operacional do AquaGraph: OpenStreetMap real (MapLibre GL) no tema
 * navy/ciano, com as camadas analíticas de cada módulo por cima.
 *
 * Decisões de desempenho:
 * - `maplibre-gl` (~800 kB) é carregado sob demanda, só no navegador;
 * - o mapa fica preso ao recorte da cidade (maxBounds, zoom 11–17,5), o que
 *   limita as tiles baixadas;
 * - a rede secundária (~1 MB) só é buscada quando o zoom passa de 13;
 * - dados mudam por `setData`/`updateImage`, sem recriar camadas;
 * - o tooltip é um único elemento React reposicionado por requestAnimationFrame.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  GeoJSONSource,
  ImageSource,
  Map as MlMap,
  MapMouseEvent,
  Marker as MlMarker,
} from "maplibre-gl";
import { Check, Layers, Locate, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSecondaryNetwork } from "@/lib/api";
import type { Severity } from "@/types";
import type { FieldGrid, LngLat, SensorReading } from "@/types/api";
import type { MapBase } from "@/types/geo";
import { basemapStyle, MAP_ATTRIBUTION } from "./basemap";
import { fieldCoordinates, fieldToImage, fieldValueAt, type RampName } from "./fields";
import {
  boundaryGeoJSON,
  EMPTY_FC,
  FIELD_BEFORE,
  HOVER_LAYERS,
  LAYER_GROUPS,
  LEVEL_COLOR,
  OVERLAY_LAYERS,
  pointsGeoJSON,
  reservoirsGeoJSON,
  sectorPointsGeoJSON,
  sectorsGeoJSON,
  sensorsGeoJSON,
  type LayerOption,
  type MapLayerKey,
  type SectorStyle,
} from "./layers";
import { MapTooltip, type HoverTarget } from "./MapTooltip";

export type { LayerOption, MapLayerKey, SectorStyle };

export type MapMarkerSpec = {
  id: string;
  lngLat: LngLat;
  level: Severity;
  kind: "alert" | "facility" | "recommendation" | "installed" | "pipe";
  label: string;
  detail?: string;
  pulse?: boolean;
  /** Camada do painel que liga/desliga o marcador. */
  layer?: MapLayerKey;
  tooltip?: ReactNode;
  onClick?: () => void;
};

export type MapFieldSpec = {
  id: "flood" | "susceptibility" | "uncertainty" | "coverage";
  grid: FieldGrid;
  ramp: RampName;
  intensity?: number;
  /** Texto do tooltip: valor 0–1 do campo → descrição. */
  describe?: (value: number) => string;
};

export type MapLegend = {
  title: string;
  gradient?: string[];
  ticks?: string[];
  swatches?: Array<{ level: Severity; label: string }>;
};

type OpsMapProps = {
  base: MapBase;
  layers: LayerOption[];
  forceLayers?: Partial<Record<MapLayerKey, boolean>>;
  sectorStyles?: Record<string, SectorStyle>;
  selectedSector?: string | null;
  onSelectSector?: (sectorId: string) => void;
  highlightPipes?: Array<{ id: string; level: Severity }>;
  heat?: Array<{ lngLat: LngLat; weight: number }>;
  fields?: MapFieldSpec[];
  markers?: MapMarkerSpec[];
  readings?: Record<string, SensorReading>;
  legend?: MapLegend | null;
  tabs?: ReadonlyArray<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  focus?: { lngLat: LngLat; zoom?: number; key: string } | null;
  /** Texto do canto: o que esta camada mostra e de onde vêm os dados. */
  caption?: string;
  className?: string;
  compact?: boolean;
};

type MapLibreModule = typeof import("maplibre-gl");

const SCALE_STEPS = [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000];

function scaleFor(map: MlMap) {
  const center = map.getCenter();
  const metersPerPixel =
    (40_075_016.686 * Math.cos((center.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  const target = metersPerPixel * 96;
  const meters = SCALE_STEPS.reduce(
    (best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best),
    SCALE_STEPS[0] ?? 100,
  );
  return {
    width: Math.round(meters / metersPerPixel),
    label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
  };
}

export function OpsMap({
  base,
  layers,
  forceLayers,
  sectorStyles,
  selectedSector = null,
  onSelectSector,
  highlightPipes,
  heat,
  fields,
  markers,
  readings,
  legend,
  tabs,
  activeTab,
  onTabChange,
  focus,
  caption,
  className,
  compact = false,
}: OpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [scale, setScale] = useState({ width: 96, label: "1 km" });
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [active, setActive] = useState<Set<MapLayerKey>>(
    () => new Set(layers.filter((l) => l.on).map((l) => l.id)),
  );
  const [layersOpen, setLayersOpen] = useState(!compact);
  const [query, setQuery] = useState("");

  const has = (key: MapLayerKey) => forceLayers?.[key] ?? active.has(key);
  const needsSecondary = has("secondary") && zoom >= 13;
  const mainIds = useMemo(
    () => new Set(base.network.features.map((feature) => feature.properties.id)),
    [base],
  );
  // Trechos destacados que não estão na rede principal exigem a rede secundária.
  const highlightNeedsSecondary = (highlightPipes ?? []).some((pipe) => !mainIds.has(pipe.id));
  const secondary = useSecondaryNetwork(needsSecondary || highlightNeedsSecondary);

  // Mantém callbacks atuais acessíveis aos handlers registrados uma única vez.
  /** O usuário já moveu/aproximou o mapa (então não reenquadramos sozinhos). */
  const userMoved = useRef(false);
  const latest = useRef({ onSelectSector, base, readings, sectorStyles, fields });
  latest.current = { onSelectSector, base, readings, sectorStyles, fields };

  // -------------------------------------------------------------------------
  // Criação do mapa
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    // `import.meta.env.SSR` é constante no build: no bundle do servidor o
    // ramo morto some e o MapLibre (~1,4 MB) não entra.
    if (import.meta.env.SSR) return;
    void import("maplibre-gl")
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const lib = ((mod as unknown as { default?: MapLibreModule }).default ??
          mod) as MapLibreModule;
        libRef.current = lib;
        const [west, south, east, north] = base.city.bbox;
        map = new lib.Map({
          container: containerRef.current,
          style: basemapStyle,
          bounds: [west, south, east, north],
          fitBoundsOptions: { padding: compact ? 8 : 18 },
          maxBounds: [west - 0.07, south - 0.06, east + 0.07, north + 0.06],
          minZoom: 11,
          maxZoom: 17.5,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          fadeDuration: 120,
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        mapRef.current = map;

        // `style.load` dispara assim que o estilo é lido; `load` esperaria todas
        // as tiles iniciais — uma tile lenta seguraria as camadas operacionais.
        map.once("style.load", () => {
          if (!map) return;
          addOverlays(map, latest.current.base);
          setZoom(map.getZoom());
          setScale(scaleFor(map));
          setReady(true);
        });

        // O painel pode mudar de altura depois que o mapa nasce (dados chegando
        // nas colunas vizinhas). Enquanto o usuário não mexer no mapa, a cidade
        // é reenquadrada a cada redimensionamento.
        map.on("movestart", (event) => {
          if ((event as { originalEvent?: unknown }).originalEvent) userMoved.current = true;
        });
        map.on("resize", () => {
          if (!map || userMoved.current) return;
          map.fitBounds([west, south, east, north], { padding: compact ? 8 : 18, duration: 0 });
        });

        let frame = 0;
        map.on("move", () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            if (!map) return;
            const next = scaleFor(map);
            setScale((current) =>
              current.width === next.width && current.label === next.label ? current : next,
            );
          });
        });
        map.on("zoomend", () => map && setZoom(map.getZoom()));

        let hoverFrame = 0;
        map.on("mousemove", (event: MapMouseEvent) => {
          cancelAnimationFrame(hoverFrame);
          hoverFrame = requestAnimationFrame(() => {
            if (!map) return;
            const target = pickFeature(map, event, latest.current.fields);
            map.getCanvas().style.cursor = target?.clickable ? "pointer" : "";
            setHover((current) => (sameTarget(current, target) ? current : target));
          });
        });
        map.on("mouseout", () => setHover(null));
        map.on("click", (event: MapMouseEvent) => {
          if (!map) return;
          const features = map.queryRenderedFeatures(event.point, { layers: ["ag-sectors-fill"] });
          const id = features[0]?.properties?.["id"];
          if (typeof id === "string") latest.current.onSelectSector?.(id);
        });
        map.on("error", (event) => {
          // Tiles que falham não derrubam o mapa; só um estilo inacessível conta.
          if (!map?.isStyleLoaded() && String(event.error?.message ?? "").includes("style"))
            setFailed(true);
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // O mapa é criado uma única vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Dados → fontes
  // -------------------------------------------------------------------------
  const setSource = (id: string, data: unknown) => {
    const source = mapRef.current?.getSource(id) as GeoJSONSource | undefined;
    source?.setData(data as never);
  };

  useEffect(() => {
    if (!ready) return;
    setSource("ag-sectors", sectorsGeoJSON(base, sectorStyles, selectedSector));
    setSource("ag-sector-points", sectorPointsGeoJSON(base, sectorStyles));
  }, [ready, base, sectorStyles, selectedSector]);

  useEffect(() => {
    if (!ready) return;
    setSource("ag-sensors", sensorsGeoJSON(base, readings));
    setSource("ag-reservoirs", reservoirsGeoJSON(base, readings));
  }, [ready, base, readings]);

  useEffect(() => {
    if (!ready || !secondary.data) return;
    setSource("ag-secondary", secondary.data);
  }, [ready, secondary.data]);

  useEffect(() => {
    if (!ready) return;
    const levels = new Map((highlightPipes ?? []).map((pipe) => [pipe.id, pipe.level]));
    const pool = [...base.network.features, ...(secondary.data?.features ?? [])];
    setSource("ag-highlight", {
      type: "FeatureCollection",
      features: pool
        .filter((feature) => levels.has(feature.properties.id))
        .map((feature) => ({
          ...feature,
          properties: { ...feature.properties, level: levels.get(feature.properties.id) },
        })),
    });
  }, [ready, base, highlightPipes, secondary.data]);

  useEffect(() => {
    if (!ready) return;
    setSource("ag-heat", {
      type: "FeatureCollection",
      features: (heat ?? []).map((point) => ({
        type: "Feature",
        properties: { w: point.weight },
        geometry: { type: "Point", coordinates: point.lngLat },
      })),
    });
  }, [ready, heat]);

  // Campos (imagens) — recriados só quando a grade ou a intensidade mudam.
  // Chave pelo conteúdo inteiro da grade (o começo dela é sempre zero, fora
  // do recorte) + intensidade; cada campo só é redesenhado quando a sua muda.
  const fieldKeys = (fields ?? []).map(
    (f) => `${f.id}:${f.ramp}:${(f.intensity ?? 1).toFixed(2)}:${f.grid.data}`,
  );
  const fieldKey = fieldKeys.join("|");
  const drawnFields = useRef(new Map<string, string>());
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (fields ?? []).forEach((field, index) => {
      const sourceId = `ag-field-${field.id}`;
      const key = fieldKeys[index] ?? "";
      if (drawnFields.current.get(sourceId) === key && map.getSource(sourceId)) return;
      drawnFields.current.set(sourceId, key);
      const url = fieldToImage(field.grid, field.ramp, field.intensity ?? 1);
      const source = map.getSource(sourceId) as ImageSource | undefined;
      if (source) {
        source.updateImage({ url, coordinates: fieldCoordinates(field.grid) });
      } else {
        map.addSource(sourceId, { type: "image", url, coordinates: fieldCoordinates(field.grid) });
        map.addLayer(
          {
            id: sourceId,
            type: "raster",
            source: sourceId,
            paint: {
              "raster-opacity": 0.92,
              "raster-resampling": "linear",
              "raster-fade-duration": 0,
            },
          },
          FIELD_BEFORE,
        );
      }
    });
    applyVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fieldKey]);

  // Visibilidade das camadas.
  const visibilityKey =
    layers.map((l) => `${l.id}:${has(l.id)}`).join(",") + JSON.stringify(forceLayers ?? {});
  function applyVisibility() {
    const map = mapRef.current;
    if (!map) return;
    const all = new Set<MapLayerKey>([
      ...layers.map((l) => l.id),
      ...(Object.keys(forceLayers ?? {}) as MapLayerKey[]),
    ]);
    for (const key of Object.keys(LAYER_GROUPS) as MapLayerKey[]) {
      const visible = all.has(key) ? has(key) : false;
      for (const id of LAYER_GROUPS[key]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }
  }
  useEffect(() => {
    if (ready) applyVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, visibilityKey]);

  const focusKey = focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    userMoved.current = true;
    map.flyTo({
      center: focus.lngLat,
      zoom: focus.zoom ?? Math.max(map.getZoom(), 14),
      duration: 900,
      essential: true,
    });
    // Voa só quando a chave do foco muda (o objeto é recriado a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  // -------------------------------------------------------------------------
  // Busca
  // -------------------------------------------------------------------------
  const searchIndex = useMemo(
    () => [
      ...base.sectors.map((s) => ({
        id: s.id,
        label: `Setor ${s.id} · ${s.name}`,
        detail: s.neighborhoods.slice(1, 4).join(", ") || "Setor de abastecimento",
        lngLat: s.centroid,
        sector: s.id,
        zoom: 13.6,
      })),
      ...base.sensors.map((s) => ({
        id: s.id,
        label: s.id,
        detail: `Sensor · setor ${s.sector ?? "—"}`,
        lngLat: s.lngLat,
        sector: null,
        zoom: 15.5,
      })),
      ...base.reservoirs.map((r) => ({
        id: r.id,
        label: `${r.id} · ${r.name}`,
        detail: `${r.capacity.toLocaleString("pt-BR")} m³`,
        lngLat: r.lngLat,
        sector: null,
        zoom: 15.5,
      })),
      ...base.hotspots.map((h) => ({
        id: h.id,
        label: h.name,
        detail: `Ponto de alagamento · ${h.stream}`,
        lngLat: h.lngLat,
        sector: null,
        zoom: 15.5,
      })),
      ...base.facilities.map((f) => ({
        id: f.id,
        label: f.name,
        detail: f.kind,
        lngLat: f.lngLat,
        sector: null,
        zoom: 15.5,
      })),
    ],
    [base],
  );
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return searchIndex
      .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [query, searchIndex]);

  const flyTo = (lngLat: LngLat, zoomLevel: number) => {
    userMoved.current = true;
    mapRef.current?.flyTo({ center: lngLat, zoom: zoomLevel, duration: 900, essential: true });
  };

  const zoomBy = (direction: 1 | -1) => {
    userMoved.current = true;
    if (direction > 0) mapRef.current?.zoomIn();
    else mapRef.current?.zoomOut();
  };

  const resetView = () => {
    userMoved.current = false;
    const [west, south, east, north] = base.city.bbox;
    mapRef.current?.fitBounds([west, south, east, north], {
      padding: compact ? 8 : 18,
      duration: 700,
    });
  };

  const visibleMarkers = useMemo(
    () => (markers ?? []).filter((marker) => !marker.layer || has(marker.layer)),
    // `has` depende só de `active` e `forceLayers`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, active, forceLayers],
  );

  return (
    <div className={cn("ops-map", compact && "ops-map-compact", className)}>
      <div
        ref={containerRef}
        className="ops-map-canvas"
        aria-label={`Mapa de ${base.city.name}`}
        role="region"
      />
      {!ready && !failed && (
        <div className="map-loading">
          <span className="map-loading-dot" />
          Carregando mapa de {base.city.name}…
        </div>
      )}
      {failed && (
        <div className="map-loading">
          Não foi possível carregar o mapa base. Verifique a conexão.
        </div>
      )}

      {ready && mapRef.current && libRef.current && (
        <MarkerLayer
          map={mapRef.current}
          lib={libRef.current}
          markers={visibleMarkers}
          onHover={setHover}
        />
      )}

      {hover && (
        <MapTooltip target={hover} base={base} readings={readings} sectorStyles={sectorStyles} />
      )}

      {!compact && (
        <div className="map-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar setor, sensor, reservatório..."
            aria-label="Buscar no mapa"
          />
          {results.length > 0 && (
            <ul className="map-search-results">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => {
                      flyTo(result.lngLat, result.zoom);
                      if (result.sector) onSelectSector?.(result.sector);
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
      )}

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
        <button type="button" onClick={() => zoomBy(1)} title="Aproximar" aria-label="Aproximar">
          <Plus />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} title="Afastar" aria-label="Afastar">
          <Minus />
        </button>
        <button
          type="button"
          onClick={resetView}
          title="Enquadrar a cidade"
          aria-label="Enquadrar a cidade"
        >
          <Locate />
        </button>
      </div>

      {!compact && (
        <div className="map-compass" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2 L15 13 L12 11 L9 13 Z" />
          </svg>
          <b>N</b>
        </div>
      )}

      {!compact && layers.length > 0 && (
        <div className={cn("map-layers", !layersOpen && "is-collapsed")}>
          <button
            className="map-layers-toggle"
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
          >
            <Layers />
            <span>Camadas</span>
          </button>
          {layersOpen && (
            <ul>
              {layers.map((layer) => {
                const forced = forceLayers?.[layer.id] !== undefined;
                return (
                  <li key={layer.id}>
                    <button
                      type="button"
                      className={cn(has(layer.id) && "active")}
                      disabled={forced}
                      onClick={() =>
                        setActive((current) => {
                          const next = new Set(current);
                          if (next.has(layer.id)) next.delete(layer.id);
                          else next.add(layer.id);
                          return next;
                        })
                      }
                    >
                      <i>{has(layer.id) && <Check />}</i>
                      {layer.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {legend && (
        <div className="map-legend">
          <span className="map-legend-title">{legend.title}</span>
          {legend.gradient && (
            <>
              <div
                className="map-legend-bar"
                style={{ background: `linear-gradient(90deg, ${legend.gradient.join(", ")})` }}
              />
              <div className="map-legend-ticks">
                {legend.ticks?.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
            </>
          )}
          {legend.swatches && (
            <ul className="map-legend-swatches">
              {legend.swatches.map((swatch) => (
                <li key={swatch.label}>
                  <i style={{ background: LEVEL_COLOR[swatch.level] }} />
                  {swatch.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="map-scale">
        <div className="map-scale-bar" style={{ width: scale.width }}>
          <i />
          <i className="alt" />
          <i />
        </div>
        <div className="map-scale-ticks" style={{ width: scale.width }}>
          <span>0</span>
          <span>{scale.label}</span>
        </div>
      </div>

      {caption && !compact && <div className="map-caption">{caption}</div>}
      <div className="map-attribution" dangerouslySetInnerHTML={{ __html: MAP_ATTRIBUTION }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camadas: criação única no `load`
// ---------------------------------------------------------------------------

function addOverlays(map: MlMap, base: MapBase) {
  const geo = (data: unknown) => ({ type: "geojson" as const, data: data as never });
  map.addSource("ag-sectors", geo(sectorsGeoJSON(base, undefined, null)));
  map.addSource("ag-sector-points", geo(sectorPointsGeoJSON(base, undefined)));
  map.addSource("ag-boundary", geo(boundaryGeoJSON(base)));
  map.addSource("ag-heat", geo(EMPTY_FC));
  map.addSource("ag-streams", geo(base.streams));
  map.addSource("ag-network", geo(base.network));
  map.addSource("ag-secondary", geo(EMPTY_FC));
  map.addSource("ag-highlight", geo(EMPTY_FC));
  map.addSource("ag-facilities", geo(pointsGeoJSON(base.facilities, (f) => ({ kind: f.kind }))));
  map.addSource("ag-wells", geo(pointsGeoJSON(base.wells)));
  map.addSource("ag-reservoirs", geo(reservoirsGeoJSON(base, undefined)));
  map.addSource("ag-sensors", geo(sensorsGeoJSON(base, undefined)));
  for (const layer of OVERLAY_LAYERS) map.addLayer(layer);
}

function pickFeature(
  map: MlMap,
  event: MapMouseEvent,
  fields: MapFieldSpec[] | undefined,
): HoverTarget | null {
  const layers = HOVER_LAYERS.filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
  );
  const features = map.queryRenderedFeatures(
    [
      [event.point.x - 4, event.point.y - 4],
      [event.point.x + 4, event.point.y + 4],
    ],
    { layers },
  );
  const ordered = [...features].sort(
    (a, b) => HOVER_LAYERS.indexOf(a.layer.id) - HOVER_LAYERS.indexOf(b.layer.id),
  );
  const top = ordered[0];
  const lngLat: LngLat = [event.lngLat.lng, event.lngLat.lat];
  const fieldValues = (fields ?? [])
    .filter(
      (field) =>
        map.getLayer(`ag-field-${field.id}`) &&
        map.getLayoutProperty(`ag-field-${field.id}`, "visibility") !== "none",
    )
    .map((field) => {
      const value = fieldValueAt(field.grid, lngLat);
      return value !== null && field.describe ? field.describe(value) : null;
    })
    .filter((text): text is string => Boolean(text));
  if (!top && fieldValues.length === 0) return null;
  return {
    x: event.point.x,
    y: event.point.y,
    layer: top?.layer.id ?? "field",
    properties: (top?.properties ?? {}) as Record<string, unknown>,
    fieldValues,
    clickable: top?.layer.id === "ag-sectors-fill",
  };
}

// ---------------------------------------------------------------------------
// Marcadores HTML (alertas, recomendação de sensor, pontos de alagamento)
// ---------------------------------------------------------------------------

function MarkerLayer({
  map,
  lib,
  markers,
  onHover,
}: {
  map: MlMap;
  lib: MapLibreModule;
  markers: MapMarkerSpec[];
  onHover: (target: HoverTarget | null) => void;
}) {
  const store = useRef(new Map<string, { marker: MlMarker; element: HTMLDivElement }>());
  const [, force] = useState(0);

  useEffect(() => {
    const current = store.current;
    const ids = new Set(markers.map((m) => m.id));
    for (const [id, entry] of current) {
      if (!ids.has(id)) {
        entry.marker.remove();
        current.delete(id);
      }
    }
    let added = false;
    for (const spec of markers) {
      const existing = current.get(spec.id);
      if (existing) {
        existing.marker.setLngLat(spec.lngLat);
        continue;
      }
      const element = document.createElement("div");
      element.className = "ag-marker-host";
      const marker = new lib.Marker({ element, anchor: "center" })
        .setLngLat(spec.lngLat)
        .addTo(map);
      current.set(spec.id, { marker, element });
      added = true;
    }
    if (added) force((n) => n + 1);
  }, [map, lib, markers]);

  useEffect(
    () => () => {
      for (const entry of store.current.values()) entry.marker.remove();
      store.current.clear();
    },
    [],
  );

  // Balão à esquerda quando há outro marcador logo a leste (evita sobreposição).
  const leftSide = useMemo(() => {
    const result = new Set<string>();
    for (const a of markers) {
      const neighbor = markers.some(
        (b) =>
          b.id !== a.id &&
          b.lngLat[0] > a.lngLat[0] &&
          b.lngLat[0] - a.lngLat[0] < 0.016 &&
          Math.abs(b.lngLat[1] - a.lngLat[1]) < 0.007,
      );
      if (neighbor) result.add(a.id);
    }
    return result;
  }, [markers]);

  return (
    <>
      {markers.map((spec) => {
        const entry = store.current.get(spec.id);
        if (!entry) return null;
        return createPortal(
          <MarkerPin spec={spec} map={map} onHover={onHover} left={leftSide.has(spec.id)} />,
          entry.element,
          spec.id,
        );
      })}
    </>
  );
}

/** Balão fixo só para o que pede atenção; o resto aparece no tooltip. */
const hasCallout = (spec: MapMarkerSpec) =>
  spec.kind === "recommendation" ||
  spec.kind === "installed" ||
  spec.level === "attention" ||
  spec.level === "high" ||
  spec.level === "critical";

function MarkerPin({
  spec,
  map,
  onHover,
  left,
}: {
  spec: MapMarkerSpec;
  map: MlMap;
  onHover: (target: HoverTarget | null) => void;
  left: boolean;
}) {
  const color = LEVEL_COLOR[spec.level];
  return (
    <button
      type="button"
      className={cn(
        "ag-pin",
        `ag-pin-${spec.kind}`,
        spec.pulse && "is-pulsing",
        `level-${spec.level}`,
        left && "callout-left",
        !hasCallout(spec) && "no-callout",
      )}
      style={{ ["--pin" as string]: color }}
      onClick={spec.onClick}
      onMouseEnter={() => {
        const point = map.project(spec.lngLat);
        onHover({
          x: point.x,
          y: point.y,
          layer: "marker",
          properties: {},
          fieldValues: [],
          clickable: Boolean(spec.onClick),
          content: spec.tooltip ?? null,
          marker: spec,
        });
      }}
      onMouseLeave={() => onHover(null)}
      aria-label={`${spec.label}${spec.detail ? ` — ${spec.detail}` : ""}`}
    >
      <span className="ag-pin-halo" />
      <span className="ag-pin-core">
        {spec.kind === "recommendation" || spec.kind === "installed" ? (
          <i className="ag-pin-ring" />
        ) : spec.kind === "facility" ? (
          "+"
        ) : (
          "!"
        )}
      </span>
      <span className="ag-pin-callout">
        <strong>{spec.label}</strong>
        {spec.detail && <small>{spec.detail}</small>}
      </span>
    </button>
  );
}

/** Mesmo elemento sob o cursor? Evita re-renderizar o mapa a cada pixel. */
function sameTarget(a: HoverTarget | null, b: HoverTarget | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.layer !== b.layer || a.marker?.id !== b.marker?.id) return false;
  if (a.properties["id"] !== b.properties["id"] || a.properties["n"] !== b.properties["n"])
    return false;
  if (a.fieldValues.join("|") !== b.fieldValues.join("|")) return false;
  // Mesmo alvo: só reposiciona se o cursor andou o suficiente.
  return Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 6;
}
