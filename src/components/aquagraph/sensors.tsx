/**
 * Leituras de sensores: cartões compactos (seção "Dados coletados") e o
 * inventário completo da rede de monitoramento (Active Sensing).
 */
import { Fragment } from "react";
import { Activity, CloudRain, Database, Gauge, Waves, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sensorKinds } from "@/lib/glossary";
import { num, signed } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SensorReading, SensorType } from "@/types/api";
import type { MapBase } from "@/types/geo";
import { OriginBadge, Sparkline, StatusBadge, type Tone } from "./primitives";

export const SENSOR_ICON: Record<SensorType, LucideIcon> = {
  flow: Activity,
  pressure: Gauge,
  level: Database,
  rain: CloudRain,
  river: Waves,
};

const toneOf = (reading: SensorReading): Tone =>
  reading.level === "critical"
    ? "critical"
    : reading.level === "high"
      ? "high"
      : reading.level === "attention"
        ? "warning"
        : "cyan";

/** Cartão de um sensor com leitura atual, desvio e série de 24 h. */
export function SensorCard({ reading, place }: { reading: SensorReading; place?: string }) {
  const kind = sensorKinds[reading.type];
  const Icon = SENSOR_ICON[reading.type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <article className={cn("sensor-card", `level-${reading.level}`)} tabIndex={0}>
          <header>
            <span className="sensor-card-icon">
              <Icon />
            </span>
            <span className="sensor-card-id">
              <strong>{reading.id}</strong>
              <small>
                {kind.short}
                {place ? ` · ${place}` : ""}
              </small>
            </span>
            {reading.level !== "normal" && <StatusBadge level={reading.level} subtle />}
          </header>
          <div className="sensor-card-value">
            <b>
              {num(reading.value)} <em>{reading.unit}</em>
            </b>
            <Sparkline data={reading.trend} tone={toneOf(reading)} height={28} />
          </div>
          <small className="sensor-card-hint">
            {reading.expected !== null
              ? `esperado ${num(reading.expected)} ${reading.unit} · ${signed(reading.deviation ?? 0)}%`
              : kind.interval}
          </small>
        </article>
      </TooltipTrigger>
      <TooltipContent className="glossary-tip">
        <strong>{kind.name}</strong>
        <span>
          <b>Mede:</b> {kind.measures}
        </span>
        <span>
          <b>Para quê:</b> {kind.purpose}
        </span>
        <span>Leitura {kind.interval} · últimas 24 h no gráfico.</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function SensorGrid({
  readings,
  base,
}: {
  readings: SensorReading[];
  base?: MapBase | undefined;
}) {
  return (
    <div className="sensor-grid">
      {readings.map((reading) => (
        <SensorCard key={reading.id} reading={reading} place={placeOf(reading, base)} />
      ))}
    </div>
  );
}

function placeOf(reading: SensorReading, base: MapBase | undefined) {
  if (reading.type === "level")
    return base?.reservoirs.find((r) => r.id === reading.target)?.id ?? reading.target;
  if (reading.type === "river") return base?.sensors.find((s) => s.id === reading.id)?.stream ?? "";
  if (reading.type === "rain")
    return base?.sensors.find((s) => s.id === reading.id)?.host ?? `setor ${reading.sector ?? ""}`;
  return reading.sector ? `setor ${reading.sector}` : "";
}

const SENSOR_ORDER: SensorType[] = ["flow", "pressure", "level", "rain", "river"];

/**
 * Inventário completo, agrupado por tipo: o que cada tipo de sensor mede e
 * para que serve aparece uma vez no cabeçalho do grupo; as linhas trazem o
 * local e a leitura atual de cada sensor.
 */
export function SensorInventory({
  readings,
  base,
}: {
  readings: SensorReading[];
  base: MapBase | undefined;
}) {
  return (
    <table className="data-table sensor-table">
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Local</th>
          <th className="is-numeric">Leitura agora</th>
          <th className="is-numeric">Esperado</th>
          <th className="is-numeric">Últimas 24 h</th>
          <th>Situação</th>
          <th>Origem</th>
        </tr>
      </thead>
      <tbody>
        {SENSOR_ORDER.map((type) => {
          const group = readings.filter((reading) => reading.type === type);
          if (group.length === 0) return null;
          const kind = sensorKinds[type];
          const Icon = SENSOR_ICON[type];
          return (
            <Fragment key={type}>
              <tr className="group-row">
                <td colSpan={7}>
                  <div className="sensor-group">
                    <strong>
                      <Icon />
                      {kind.name} · {group.length}
                    </strong>
                    <span>
                      <b>Mede:</b> {kind.measures} ({kind.interval})
                    </span>
                    <span>
                      <b>Para quê:</b> {kind.purpose}
                    </span>
                  </div>
                </td>
              </tr>
              {group.map((reading) => (
                <tr key={reading.id}>
                  <td>
                    <strong>{reading.id}</strong>
                  </td>
                  <td>{placeOf(reading, base)}</td>
                  <td className="is-numeric">
                    <span
                      className={cn(
                        "sensor-table-value",
                        reading.level !== "normal" && `level-${reading.level}`,
                      )}
                    >
                      {num(reading.value)} {reading.unit}
                    </span>
                  </td>
                  <td className="is-numeric">
                    {reading.expected !== null
                      ? `${num(reading.expected)} ${reading.unit} (${signed(reading.deviation ?? 0)}%)`
                      : "—"}
                  </td>
                  <td className="is-numeric">
                    <Sparkline data={reading.trend} tone={toneOf(reading)} height={24} />
                  </td>
                  <td>
                    <StatusBadge level={reading.level} subtle />
                  </td>
                  <td>
                    <OriginBadge origin={reading.origin} />
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
