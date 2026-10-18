/**
 * Retrato "ao vivo" da cidade para a visão geral: leituras de todos os
 * sensores, situação de cada setor, manchete de cada desafio, linha do tempo
 * do dia e as próximas decisões.
 */
import type {
  LiveSnapshot,
  ModuleHeadline,
  RainMode,
  SensorReading,
  TimelineEvent,
} from "@/types/api";
import type { Severity } from "@/types";
import { model, toLngLat, type ModelSensor } from "../geo/model.server";
import {
  HOUR,
  MINUTE,
  clamp,
  formatClock,
  formatDate,
  formatRelative,
  isoLocal,
  local,
  memoAsync,
  ptn,
  round,
  sensorNoise,
} from "./core.server";
import {
  buildDecisions,
  modelOutputs,
  opsKey,
  workOrders,
  type ModelOutputs,
  type OpsState,
} from "./decisions.server";
import { systemLevels } from "./drought.server";
import {
  expectedInflow,
  expectedPressure,
  measuredInflow,
  measuredPressure,
} from "./hydraulics.server";
import { eventsAt, getLeakReplay } from "./losses.server";
import { getWeather } from "./weather.server";

const READINGS_PER_HOUR: Record<SensorReading["type"], number> = {
  flow: 12,
  pressure: 12,
  level: 60,
  rain: 60,
  river: 30,
};

function deviationLevel(deviation: number, warn: number, high: number, critical: number): Severity {
  const d = Math.abs(deviation);
  if (d >= critical) return "critical";
  if (d >= high) return "high";
  if (d >= warn) return "attention";
  return "normal";
}

/** Nível do reservatório ao longo do dia: enche de madrugada, esvazia no pico. */
function reservoirLevel(base: number, sensor: ModelSensor, t: number) {
  const hour = local(t).hour + local(t).minute / 60;
  const cycle = 9 * Math.cos(((hour - 5) / 24) * 2 * Math.PI);
  return clamp(base + cycle + 1.2 * sensorNoise(`NV:${sensor.id}`, t), 3, 99);
}

async function sensorReadings(now: number, outputs: ModelOutputs): Promise<SensorReading[]> {
  const events = eventsAt(now);
  const weather = await getWeather();
  const levels = await systemLevels(now);
  const pastRain = weather.hourly.filter((h) => h.time <= isoLocal(now)).slice(-24);
  const readings: SensorReading[] = [];
  for (const sensor of model.sensors) {
    const trend: number[] = [];
    let value = 0;
    let expected: number | null = null;
    let unit = "";
    let level: Severity = "normal";
    if (sensor.type === "flow" && sensor.sector) {
      for (let k = 23; k >= 0; k -= 1)
        trend.push(round(measuredInflow(sensor.sector, now - k * HOUR, events), 1));
      value = round(measuredInflow(sensor.sector, now, events), 1);
      expected = round(expectedInflow(sensor.sector, now), 1);
      unit = "L/s";
      level = deviationLevel((value - expected) / expected, 0.04, 0.08, 0.14);
    } else if (sensor.type === "pressure") {
      for (let k = 23; k >= 0; k -= 1)
        trend.push(round(measuredPressure(sensor, now - k * HOUR, events), 1));
      value = round(measuredPressure(sensor, now, events), 1);
      expected = round(expectedPressure(sensor, now), 1);
      unit = "mca";
      const deviation = (value - expected) / expected;
      level = deviation < 0 ? deviationLevel(deviation, 0.025, 0.05, 0.08) : "normal";
    } else if (sensor.type === "level") {
      const reservoir = model.reservoirs.find((r) => r.id === sensor.target);
      const base = levels.get(reservoir?.system ?? "")?.level ?? 60;
      for (let k = 23; k >= 0; k -= 1)
        trend.push(round(reservoirLevel(base, sensor, now - k * HOUR), 1));
      value = round(reservoirLevel(base, sensor, now), 1);
      expected = null;
      unit = "%";
      level = value < 25 ? "critical" : value < 35 ? "high" : value < 45 ? "attention" : "normal";
    } else if (sensor.type === "rain") {
      // Pluviômetros: chuva real da última hora na estação mais próxima (Open-Meteo).
      const series = pastRain.map((h) =>
        round(h.precipitation * (1 + 0.15 * sensorNoise(`PL:${sensor.id}`, Date.parse(h.time))), 1),
      );
      trend.push(...series);
      value = round(weather.precipitation * (1 + 0.15 * sensorNoise(`PL:${sensor.id}`, now)), 1);
      unit = "mm/h";
      level = value >= 30 ? "critical" : value >= 15 ? "high" : value >= 5 ? "attention" : "normal";
    } else if (sensor.type === "river") {
      const river = outputs.flood.rivers.find((r) => r.sensorId === sensor.id);
      const observed = river?.series.filter((p) => p.level !== null).map((p) => p.level ?? 0) ?? [];
      trend.push(...observed);
      value = observed[observed.length - 1] ?? 0.4;
      unit = "m";
      level =
        river && value >= river.flood
          ? "critical"
          : river && value >= river.alert
            ? "high"
            : "normal";
    }
    readings.push({
      id: sensor.id,
      type: sensor.type,
      sector: sensor.sector,
      target: sensor.target,
      value,
      unit,
      expected,
      deviation: expected ? round(((value - expected) / expected) * 100, 1) : null,
      level,
      trend,
      origin: sensor.type === "rain" && weather.source === "open-meteo" ? "real" : "simulado",
    });
  }
  return readings;
}

function headlines(outputs: ModelOutputs): ModuleHeadline[] {
  const { losses, drought, flood, sensing } = outputs;
  const leak = losses.sectors[0];
  const system = drought.systems.find((s) => s.id === drought.focus);
  const first = flood.hotspots.find((h) => h.minutesToCritical !== null) ?? flood.hotspots[0];
  // Próximo sensor ainda não instalado na simulação atual.
  const next = sensing.plan[sensing.installed];
  return [
    {
      module: "perdas",
      level: leak?.level ?? "normal",
      title: leak ? `Setor ${leak.id} · ${leak.name}` : "Rede de distribuição",
      detail:
        leak && leak.leakProbability >= 60
          ? `Provável vazamento não visível — ${losses.city.alertSectors} setores em observação.`
          : "Sem anomalias relevantes nas últimas 24 h.",
      metric: `${leak?.leakProbability ?? 0}%`,
      metricLabel: "prob. de vazamento",
      lngLat: losses.selected.candidates[0]?.lngLat ?? leak?.lngLat ?? null,
    },
    {
      module: "seca",
      level: system?.severity ?? "normal",
      title: system
        ? `${system.name} · reservação em ${Math.round(system.level)}%`
        : "Abastecimento",
      detail: system
        ? system.daysToCritical !== null
          ? `Zona crítica em ${system.daysToCritical} dias na tendência atual.`
          : `${system.wellsOffline} poço(s) em manutenção; sob estresse climático, crítico em ${system.adverseDays ?? "> 150"} dias.`
        : "Produção acompanha a demanda.",
      metric:
        system?.daysToCritical !== null && system?.daysToCritical !== undefined
          ? `${system.daysToCritical} d`
          : `${system?.adverseDays ?? "—"} d`,
      metricLabel:
        system?.daysToCritical !== null && system?.daysToCritical !== undefined
          ? "até criticidade"
          : "sob estresse",
      lngLat: (() => {
        const source = model.systems.find((s) => s.id === system?.id)?.source;
        const reservoir = model.reservoirs.find((r) => r.id === source);
        return reservoir ? toLngLat(reservoir.xy) : null;
      })(),
    },
    {
      module: "enchentes",
      level: flood.summary.level,
      title:
        flood.mode === "extreme"
          ? `Tempestade simulada · ${first?.name ?? ""}`
          : "Previsão real de chuva",
      detail: flood.summary.headline,
      metric:
        flood.summary.minutesToFirstCritical !== null
          ? `${flood.summary.minutesToFirstCritical} min`
          : `${round(flood.summary.rain24h, 0)} mm`,
      metricLabel:
        flood.summary.minutesToFirstCritical !== null ? "até nível crítico" : "previstos em 24 h",
      lngLat: first?.lngLat ?? null,
    },
    {
      module: "sensing",
      level: sensing.current.uncertainty > 35 ? "attention" : "normal",
      title: `Cobertura informacional de ${Math.round(sensing.current.coverage)}%`,
      detail: next
        ? `Próximo sensor recomendado: ${next.id} — ${next.street ?? "rede principal"} (setor ${next.sector}).`
        : "Plano de expansão concluído.",
      metric: next ? `+${next.coverageGain.toLocaleString("pt-BR")} p.p.` : "—",
      metricLabel: next ? `com ${next.id}` : "",
      lngLat: next?.lngLat ?? null,
    },
  ];
}

function timeline(
  now: number,
  outputs: ModelOutputs,
  rainMode: RainMode,
  ops: OpsState,
): TimelineEvent[] {
  const items: Array<TimelineEvent & { at: number }> = [];
  const replay = getLeakReplay(null, null, now);
  const thresholds: Array<[number, Severity, string]> = [
    [35, "attention", "Pressão e vazão começam a desviar do modelo hidráulico"],
    [60, "high", "Probabilidade de vazamento passa de 60%"],
    [80, "critical", "Madrugada confirma excesso de vazão: alerta crítico"],
  ];
  for (const [limit, level, title] of thresholds) {
    const frame = replay.frames.find((f) => f.probability >= limit);
    if (!frame) continue;
    const at = Date.parse(frame.at);
    items.push({
      id: `TL-LEAK-${limit}`,
      at,
      time: formatRelative(at, now),
      module: "perdas",
      level,
      title: `Setor ${replay.sector}: ${title}`,
      detail: `${frame.probability}% · pressão ${ptn(frame.pressureDeviation)}% · vazão ${ptn(frame.inflowExcess, 1, true)}%`,
    });
  }
  for (const order of workOrders(ops, now).slice(0, 4)) {
    const at = Date.parse(order.createdAt);
    items.push({
      id: `TL-${order.id}`,
      at,
      time: formatRelative(at, now),
      module: "operacao",
      level: order.status === "Concluída" ? "normal" : "info",
      title: `${order.id} · ${order.status.toLowerCase()}`,
      detail: `${order.title} — ${order.team}`,
    });
  }
  const system = outputs.drought.systems.find((s) => s.id === outputs.drought.focus);
  if (system && system.severity !== "normal") {
    items.push({
      id: "TL-SECA",
      at: now - 6 * HOUR,
      time: formatRelative(now - 6 * HOUR, now),
      module: "seca",
      level: system.severity,
      title: `${system.name} abaixo de ${Math.ceil(system.level / 5) * 5}%`,
      detail: `${system.wellsOffline} poço(s) em manutenção · margem de produção ${ptn(system.margin, 1, true)}%`,
    });
  }
  const weatherAt = Date.parse(outputs.flood.generatedAt) - 10 * MINUTE;
  items.push({
    id: "TL-CLIMA",
    at: weatherAt,
    time: formatRelative(weatherAt, now),
    module: "enchentes",
    level: rainMode === "extreme" ? outputs.flood.summary.level : "info",
    title: rainMode === "extreme" ? "Tempestade extrema simulada" : "Previsão de chuva atualizada",
    detail: outputs.flood.summary.headline,
  });
  items.push({
    id: "TL-SENSING",
    at: now - 40 * MINUTE,
    time: formatRelative(now - 40 * MINUTE, now),
    module: "sensing",
    level: "info",
    title: "Mapa de incerteza recalculado",
    detail: `Cobertura ${ptn(outputs.sensing.current.coverage)}% · ${outputs.sensing.plan[0]?.id ?? ""} lidera o ranking`,
  });
  return items
    .sort((a, b) => b.at - a.at)
    .map(({ at: _at, ...event }) => event)
    .slice(0, 9);
}

const snapshotCache = memoAsync<LiveSnapshot>(20_000);

/** O cache é invalidado quando uma ordem de serviço é criada (a chave muda). */
export function getLive(
  rainMode: RainMode,
  installed: number,
  ops: OpsState,
): Promise<LiveSnapshot> {
  const now = Date.now();
  const key = `${rainMode}:${installed}:${Math.floor(now / 20_000)}:${opsKey(ops)}`;
  return snapshotCache(key, () => buildLive(rainMode, installed, now, ops));
}

async function buildLive(
  rainMode: RainMode,
  installed: number,
  now: number,
  ops: OpsState,
): Promise<LiveSnapshot> {
  const weather = await getWeather();
  const outputs = await modelOutputs(rainMode, installed, now);
  const sensors = await sensorReadings(now, outputs);
  const decisions = buildDecisions(outputs, ops);
  const orders = workOrders(ops, now);
  const levels = await systemLevels(now);

  const sectors = outputs.losses.sectors.map((sector) => {
    const info = model.sectors.find((s) => s.id === sector.id);
    const droughtSystem = outputs.drought.systems.find((s) => s.id === info?.system);
    return {
      id: sector.id,
      name: sector.name,
      system: info?.system ?? "",
      level: sector.level,
      leakProbability: sector.leakProbability,
      lossRate: sector.lossRate,
      inflow: sensors.find((s) => s.type === "flow" && s.sector === sector.id)?.value ?? 0,
      pressureDeviation: sector.pressureDeviation,
      daysToCritical:
        droughtSystem?.daysToCritical ?? levels.get(info?.system ?? "")?.daysToCritical ?? null,
    };
  });

  const risks =
    outputs.losses.sectors.filter((s) => s.leakProbability >= 35).length +
    outputs.drought.systems.filter((s) => s.severity !== "normal").length +
    outputs.flood.hotspots.filter((h) => h.level !== "normal").length;
  const criticalRisks =
    outputs.losses.sectors.filter((s) => s.level === "critical").length +
    outputs.drought.systems.filter((s) => s.severity === "critical").length +
    outputs.flood.hotspots.filter((h) => h.level === "critical").length;
  const events = timeline(now, outputs, rainMode, ops);

  const snapshot: LiveSnapshot = {
    generatedAt: new Date(now).toISOString(),
    clock: { iso: new Date(now).toISOString(), time: formatClock(now), date: formatDate(now) },
    city: {
      name: model.city.name,
      state: model.city.state,
      population: model.totals.population,
      connections: model.totals.connections,
      networkKm: model.totals.networkKm,
      sectors: model.sectors.length,
    },
    weather: {
      source: weather.source,
      temperature: round(weather.temperature, 1),
      humidity: weather.humidity,
      precipitation: weather.precipitation,
      description: weather.description,
      fetchedAt: weather.fetchedAt,
    },
    rainMode,
    pipeline: {
      sensors: sensors.length,
      online: sensors.length,
      readingsLastHour: sensors.reduce((sum, s) => sum + READINGS_PER_HOUR[s.type], 0),
      models: 4,
      risks,
      criticalRisks,
      recommendations: decisions.filter(
        (d) => d.status === "Pendente" || d.status === "Simulada" || d.status === "Planejada",
      ).length,
      openOrders: orders.filter((o) => o.status === "Aberta").length,
      runningOrders: orders.filter((o) => o.status === "Em execução").length,
    },
    sensors,
    sectors,
    headlines: headlines(outputs),
    timeline: events,
    topActions: decisions.filter((d) => d.status !== "Concluída").slice(0, 4),
    notifications: events.filter((e) => e.level === "critical" || e.level === "high").slice(0, 5),
  };
  return snapshot;
}
