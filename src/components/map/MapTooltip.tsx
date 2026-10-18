/**
 * Tooltip do mapa: ao passar o mouse sobre qualquer elemento, explica o que
 * ele é, de onde vem o dado (real × simulado) e a leitura atual.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Sparkline } from "@/components/aquagraph/primitives";
import { PIPE_CLASS_LABEL, sensorKinds } from "@/lib/glossary";
import { severityLabel } from "@/lib/severity";
import type { SensorReading } from "@/types/api";
import type { MapBase } from "@/types/geo";
import type { SectorStyle } from "./layers";
import type { MapMarkerSpec } from "./OpsMap";

export type HoverTarget = {
  x: number;
  y: number;
  layer: string;
  properties: Record<string, unknown>;
  fieldValues: string[];
  clickable: boolean;
  content?: ReactNode;
  marker?: MapMarkerSpec;
};

const str = (value: unknown) =>
  typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
const fmt = (value: number, digits = 1) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: digits });

function Origin({ kind }: { kind: "real" | "simulado" | "modelo" | "misto" }) {
  const label = {
    real: "Dado real · OSM",
    simulado: "Sensor simulado",
    modelo: "Cálculo do modelo",
    misto: "Posição real · atributos simulados",
  }[kind];
  return <span className={`map-tip-origin origin-${kind}`}>{label}</span>;
}

function SensorTip({
  id,
  base,
  readings,
}: {
  id: string;
  base: MapBase;
  readings: Record<string, SensorReading> | undefined;
}) {
  const sensor = base.sensors.find((s) => s.id === id);
  const reading = readings?.[id];
  if (!sensor) return null;
  const kind = sensorKinds[sensor.type];
  const toneClass = reading && reading.level !== "normal" ? `level-${reading.level}` : "";
  return (
    <>
      <header>
        <strong>{sensor.id}</strong>
        <span>{kind.name}</span>
      </header>
      {reading && (
        <div className="map-tip-reading">
          <b className={toneClass}>
            {fmt(reading.value)} <em>{reading.unit}</em>
          </b>
          {reading.expected !== null && (
            <small>
              esperado {fmt(reading.expected)} {reading.unit}
              {reading.deviation !== null &&
                ` · ${reading.deviation > 0 ? "+" : ""}${fmt(reading.deviation)}%`}
            </small>
          )}
          {reading.trend.length > 1 && (
            <Sparkline
              data={reading.trend}
              tone={
                reading.level === "normal"
                  ? "cyan"
                  : reading.level === "attention"
                    ? "warning"
                    : reading.level === "high"
                      ? "high"
                      : "critical"
              }
              height={26}
            />
          )}
        </div>
      )}
      <p>
        <span>Mede:</span> {kind.measures}
      </p>
      <p>
        <span>Para quê:</span> {kind.purpose}
      </p>
      <footer>
        <Origin kind={sensor.type === "rain" && reading?.origin === "real" ? "real" : "simulado"} />
        <small>
          {sensor.sector ? `Setor ${sensor.sector}` : ""} · cota {sensor.elevation} m ·{" "}
          {kind.interval}
        </small>
      </footer>
    </>
  );
}

function content(
  target: HoverTarget,
  base: MapBase,
  readings: Record<string, SensorReading> | undefined,
  sectorStyles: Record<string, SectorStyle> | undefined,
) {
  const p = target.properties;
  const id = str(p["id"]);
  switch (target.layer) {
    case "marker":
      return (
        target.content ?? (
          <header>
            <strong>{target.marker?.label}</strong>
            <span>{target.marker?.detail}</span>
          </header>
        )
      );
    case "ag-sensors":
      return <SensorTip id={id} base={base} readings={readings} />;
    case "ag-reservoirs": {
      const reservoir = base.reservoirs.find((r) => r.id === id);
      if (!reservoir) return null;
      const sensor = base.sensors.find((s) => s.type === "level" && s.target === id);
      const reading = sensor ? readings?.[sensor.id] : undefined;
      return (
        <>
          <header>
            <strong>{reservoir.id}</strong>
            <span>{reservoir.name}</span>
          </header>
          {reading && (
            <div className="map-tip-reading">
              <b className={reading.level !== "normal" ? `level-${reading.level}` : ""}>
                {fmt(reading.value, 0)} <em>% de nível</em>
              </b>
              <small>sensor {sensor?.id}</small>
            </div>
          )}
          <p>
            <span>Capacidade:</span> {reservoir.capacity.toLocaleString("pt-BR")} m³ ·{" "}
            {reservoir.kind === "elevado" ? "torre elevada" : "apoiado no solo"} · cota{" "}
            {reservoir.groundElevation} m
          </p>
          <p>
            <span>Abastece:</span> setor {reservoir.sector} ·{" "}
            {reservoir.system === "sul"
              ? "Sistema Sul"
              : reservoir.system === "norte"
                ? "Sistema Norte"
                : "Sistema Central"}
          </p>
          <footer>
            <Origin kind="misto" />
            <small>{reservoir.osmId}</small>
          </footer>
        </>
      );
    }
    case "ag-wells": {
      const well = base.wells.find((w) => w.id === id);
      return (
        <>
          <header>
            <strong>{well?.id}</strong>
            <span>{well?.name}</span>
          </header>
          <p>
            Poço profundo que capta água do Aquífero Guarani — a principal fonte de Ribeirão Preto.
          </p>
          <footer>
            <Origin kind="real" />
          </footer>
        </>
      );
    }
    case "ag-facilities": {
      const facility = base.facilities.find((f) => f.id === id);
      return (
        <>
          <header>
            <strong>{facility?.name}</strong>
            <span>{facility?.kind}</span>
          </header>
          <p>Infraestrutura crítica: o acesso precisa ser garantido durante eventos de chuva.</p>
          <footer>
            <Origin kind="real" />
          </footer>
        </>
      );
    }
    case "ag-highlight":
    case "ag-network-trunk":
    case "ag-network-main":
    case "ag-network-sec": {
      const cls = (str(p["c"]) || "main") as keyof typeof PIPE_CLASS_LABEL;
      const label = PIPE_CLASS_LABEL[cls] ?? PIPE_CLASS_LABEL.main;
      return (
        <>
          <header>
            <strong>{cls === "trunk" ? id : `Trecho ${id}`}</strong>
            <span>{label.name}</span>
          </header>
          <p>{label.detail}</p>
          <p>
            <span>Tubo:</span> DN {str(p["d"])} · {str(p["m"])} · {str(p["y"])}
            {p["st"] ? ` · ${str(p["st"])}` : ""}
          </p>
          <footer>
            <Origin kind="misto" />
            <small>setor {str(p["s"])}</small>
          </footer>
        </>
      );
    }
    case "ag-streams-open":
    case "ag-streams-culvert":
      return (
        <>
          <header>
            <strong>{str(p["n"])}</strong>
            <span>
              {str(p["k"]) === "galeria" ? "Trecho canalizado (galeria)" : "Córrego a céu aberto"}
            </span>
          </header>
          <p>
            {str(p["k"]) === "galeria"
              ? "Corre sob as vias: é a macrodrenagem que recebe a água das bocas de lobo."
              : "Leito natural que recebe o escoamento das ruas na chuva."}
          </p>
          <footer>
            <Origin kind="real" />
          </footer>
        </>
      );
    case "ag-sectors-fill": {
      const sector = base.sectors.find((s) => s.id === id);
      const style = sectorStyles?.[id];
      return (
        <>
          <header>
            <strong>Setor {id}</strong>
            <span>{sector?.name}</span>
          </header>
          {style && (
            <div className="map-tip-reading">
              <b className={`level-${style.level}`}>
                {style.caption ?? severityLabel[style.level]}
              </b>
              {style.detail && <small>{style.detail}</small>}
            </div>
          )}
          {sector && sector.neighborhoods.length > 1 && (
            <p>
              <span>Bairros:</span> {sector.neighborhoods.slice(0, 5).join(", ")}
            </p>
          )}
          <footer>
            <Origin kind="modelo" />
            {target.clickable && <small>clique para analisar</small>}
          </footer>
        </>
      );
    }
    default:
      return null;
  }
}

export function MapTooltip({
  target,
  base,
  readings,
  sectorStyles,
}: {
  target: HoverTarget;
  base: MapBase;
  readings: Record<string, SensorReading> | undefined;
  sectorStyles: Record<string, SectorStyle> | undefined;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: target.x + 16, top: target.y + 16 });

  useLayoutEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left =
      target.x + 16 + width > parent.clientWidth - 8 ? target.x - width - 16 : target.x + 16;
    const top = Math.min(Math.max(8, target.y + 16), parent.clientHeight - height - 8);
    setPosition({ left: Math.max(8, left), top });
  }, [target.x, target.y, target.layer, target.properties["id"]]);

  const body = content(target, base, readings, sectorStyles);
  if (!body && target.fieldValues.length === 0) return null;
  return (
    <div
      ref={ref}
      className="map-tip"
      style={{ left: position.left, top: position.top }}
      role="tooltip"
    >
      {body}
      {target.fieldValues.length > 0 && (
        <div className="map-tip-fields">
          {target.fieldValues.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      )}
    </div>
  );
}
