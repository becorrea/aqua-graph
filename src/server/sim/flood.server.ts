/**
 * Enchentes e resposta rápida.
 *
 * Para cada ponto crítico (via real junto a córrego, identificada pelo
 * relevo no build) o motor aplica o método racional por área de contribuição:
 *   Q(t) = C · i(t) · A / 3,6        [m³/s]
 * onde i(t) é a intensidade média da chuva no último tempo de concentração
 * (Kirpich, calculado com o comprimento e a declividade reais da bacia). A
 * razão Q / capacidade da galeria indica o estado do ponto:
 *   < 0,8 normal · 0,8–1,0 atenção · 1,0–1,25 alto · ≥ 1,25 crítico.
 *
 * A chuva vem da previsão horária real (Open-Meteo) ou de uma tempestade
 * extrema simulada (74 mm em 3 h, distribuição de Huff do 1º quartil).
 */
import type {
  DataOrigin,
  FieldGrid,
  FloodFrame,
  FloodHotspot,
  FloodResponse,
  RainMode,
  Weather,
} from "@/types/api";
import type { Severity } from "@/types";
import { facilityById, model, toLngLat } from "../geo/model.server";
import { MINUTE, clamp, formatClock, isoLocal, memo, round } from "./core.server";
import { getWeather } from "./weather.server";

const STEP = 5;
const EXTREME_TOTAL = 74;
const EXTREME_START = 15;
/** Fração acumulada de Huff (1º quartil) a cada 15 min de um evento de 3 h. */
const HUFF = [0.12, 0.33, 0.52, 0.64, 0.73, 0.8, 0.86, 0.9, 0.94, 0.97, 0.99, 1];

export function floodLevel(ratio: number): Severity {
  if (ratio >= 1.25) return "critical";
  if (ratio >= 1) return "high";
  if (ratio >= 0.8) return "attention";
  return "normal";
}

/** Intensidade (mm/h) a cada `STEP` min, de −360 min até +1440 min. */
function hyetograph(weather: Weather, mode: RainMode, now: number) {
  const nowIso = isoLocal(now).slice(0, 13);
  const startIndex = weather.hourly.findIndex((h) => h.time.slice(0, 13) === nowIso);
  const minuteOfHour = new Date(now).getUTCMinutes();
  const series: Array<{ minute: number; intensity: number; origin: DataOrigin }> = [];
  for (let minute = -360; minute <= 1440; minute += STEP) {
    const hourOffset = Math.floor((minute + minuteOfHour) / 60);
    const hour = startIndex >= 0 ? weather.hourly[startIndex + hourOffset] : undefined;
    let intensity = hour ? hour.precipitation : 0;
    let origin: DataOrigin = weather.source === "open-meteo" ? "real" : "modelo";
    if (mode === "extreme" && minute >= EXTREME_START && minute < EXTREME_START + 180) {
      const k = Math.floor((minute - EXTREME_START) / 15);
      const increment = (HUFF[k] ?? 1) - (HUFF[k - 1] ?? 0);
      intensity = Math.max(intensity, (increment * EXTREME_TOTAL) / 0.25);
      origin = "simulado";
    }
    series.push({ minute, intensity, origin });
  }
  return series;
}

type Hydrology = {
  minute: number;
  ratio: number;
  flow: number;
};

function hotspotHydrology(
  hotspot: (typeof model.hotspots)[number],
  rain: ReturnType<typeof hyetograph>,
  wetness: number,
) {
  const out: Hydrology[] = [];
  const window = Math.max(1, Math.round(hotspot.tcMinutes / STEP));
  // Solo encharcado (chuva das últimas 24 h) aumenta o escoamento superficial.
  const runoff = clamp(hotspot.runoff * (1 + 0.12 * wetness), 0, 0.95);
  for (let i = 0; i < rain.length; i += 1) {
    const slice = rain.slice(Math.max(0, i - window + 1), i + 1);
    const effective = slice.reduce((sum, r) => sum + r.intensity, 0) / slice.length;
    const flow = (runoff * effective * hotspot.catchmentKm2) / 3.6;
    out.push({ minute: rain[i]?.minute ?? 0, ratio: flow / hotspot.capacity, flow });
  }
  return out;
}

function encodeField(values: number[]): string {
  const bytes = Uint8Array.from(values.map((v) => clamp(Math.round(v * 255), 0, 255)));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

const floodCache = memo<FloodResponse>(60_000);

let susceptibilityGrid: FieldGrid | null = null;
function susceptibility(): FieldGrid {
  if (!susceptibilityGrid) {
    const { bbox, cols, rows, values } = model.floodGrid;
    susceptibilityGrid = { bbox, cols, rows, data: encodeField(values.map((v) => v / 100)) };
  }
  return susceptibilityGrid;
}

export async function getFlood(mode: RainMode, now = Date.now()): Promise<FloodResponse> {
  const weather = await getWeather();
  return floodCache(`${mode}:${weather.fetchedAt}:${Math.floor(now / MINUTE)}`, () =>
    buildFlood(weather, mode, now),
  );
}

function buildFlood(weather: Weather, mode: RainMode, now: number): FloodResponse {
  const rain = hyetograph(weather, mode, now);
  const past24 = weather.hourly.filter((h) => h.time < isoLocal(now)).slice(-24);
  const wetness = clamp(past24.reduce((sum, h) => sum + h.precipitation, 0) / 30, 0, 1);
  const future = rain.filter((r) => r.minute >= 0);
  const next3h = future.filter((r) => r.minute < 180);
  const next24h = future.filter((r) => r.minute < 1440);
  const sumMm = (list: typeof rain) => list.reduce((sum, r) => sum + (r.intensity * STEP) / 60, 0);

  const results = model.hotspots.map((hotspot) => {
    const series = hotspotHydrology(hotspot, rain, wetness).filter((h) => h.minute >= 0);
    let peak = series[0] ?? { minute: 0, ratio: 0, flow: 0 };
    for (const h of series) if (h.ratio > peak.ratio) peak = h;
    const critical = series.find((h) => h.ratio >= 1.25);
    return { hotspot, series, peak, critical };
  });

  const hotspots: FloodHotspot[] = results
    .map(({ hotspot, peak, critical }) => ({
      id: hotspot.id,
      name: hotspot.name,
      stream: hotspot.stream,
      sector: hotspot.sector,
      lngLat: toLngLat(hotspot.xy),
      level: floodLevel(peak.ratio),
      peakRatio: round(peak.ratio, 2),
      minutesToCritical: critical ? critical.minute : null,
      peakMinutes: peak.ratio > 0.05 ? peak.minute : null,
      capacity: hotspot.capacity,
      peakFlow: round(peak.flow, 1),
      tcMinutes: hotspot.tcMinutes,
      catchmentKm2: hotspot.catchmentKm2,
      gallery: hotspot.gallery,
      facilities: hotspot.nearbyFacilities.flatMap(({ id, distance }) => {
        const facility = facilityById.get(id);
        return facility ? [{ id, name: facility.name, kind: facility.kind, distance }] : [];
      }),
    }))
    .sort((a, b) => b.peakRatio - a.peakRatio);

  // Quadros da animação (a cada 15 min, 3 h de evento).
  const frames: FloodFrame[] = [];
  let accum = 0;
  for (let minute = 0; minute <= 195; minute += 15) {
    const window = rain.filter(
      (r) => r.minute >= minute - 15 && r.minute < minute && r.minute >= 0,
    );
    accum += sumMm(window);
    const ratios: Record<string, number> = {};
    let maxRatio = 0;
    for (const { hotspot, series } of results) {
      const value = series.find((h) => h.minute === minute)?.ratio ?? 0;
      ratios[hotspot.id] = round(value, 2);
      maxRatio = Math.max(maxRatio, value);
    }
    const current = rain.find((r) => r.minute === minute);
    frames.push({
      minute,
      rainAccum: round(accum, 1),
      intensity: round(current?.intensity ?? 0, 1),
      maxRatio: round(maxRatio, 2),
      level: floodLevel(maxRatio),
      hotspots: ratios,
    });
  }

  // Campo de risco: suscetibilidade do relevo × severidade da chuva, com
  // reforço local em torno de cada ponto conforme a sua razão de pico.
  const { cols, rows, values, bbox } = model.floodGrid;
  const maxRatio = Math.max(0, ...results.map((r) => r.peak.ratio));
  const global = clamp(maxRatio / 1.25, 0, 1.15);
  const [west, south, east, north] = bbox;
  const cellW = (east - west) / cols;
  const cellH = (north - south) / rows;
  const field = values.map((v, i) => {
    const s = v / 100;
    if (s <= 0.02) return 0;
    const c = i % cols;
    const r = Math.floor(i / cols);
    const lon = west + (c + 0.5) * cellW;
    const lat = north - (r + 0.5) * cellH;
    let boost = 0;
    for (const { hotspot, peak } of results) {
      const [hlon, hlat] = toLngLat(hotspot.xy);
      const d = Math.hypot((lon - hlon) * 104_000, (lat - hlat) * 110_540);
      boost = Math.max(boost, clamp(peak.ratio / 1.25, 0, 1.2) * Math.exp(-d / 650));
    }
    return clamp(s * (0.15 + 0.85 * global) * (0.55 + 0.45 * boost) * 1.35, 0, 1);
  });
  const risk: FieldGrid = { bbox, cols, rows, data: encodeField(field) };

  // Réguas dos córregos.
  const rivers = model.sensors
    .filter((sensor) => sensor.type === "river")
    .map((sensor) => {
      const hotspot = model.hotspots.find((h) => h.id === sensor.target);
      const area = (hotspot?.catchmentKm2 ?? 4) * 1.4;
      const bankfull = (hotspot?.capacity ?? 50) * 1.35;
      const tc = Math.round(((hotspot?.tcMinutes ?? 45) * 1.2) / STEP);
      const c = hotspot?.runoff ?? 0.78;
      const stage = (flow: number) => 0.35 + 2.85 * (Math.max(0, flow) / bankfull) ** 0.6;
      const base = 0.06 * area;
      const series: FloodResponse["rivers"][number]["series"] = [];
      for (let i = 0; i < rain.length; i += 6) {
        const r = rain[i];
        if (!r || r.minute < -360 || r.minute > 360) continue;
        const slice = rain.slice(Math.max(0, i - tc + 1), i + 1);
        const effective = slice.reduce((sum, x) => sum + x.intensity, 0) / slice.length;
        const level = round(stage(base + (c * effective * area) / 3.6), 2);
        series.push({
          time: formatClock(now + r.minute * MINUTE),
          level: r.minute <= 0 ? level : null,
          projected: r.minute >= 0 ? level : null,
        });
      }
      return {
        sensorId: sensor.id,
        stream: sensor.stream ?? hotspot?.stream ?? "Córrego",
        alert: round(stage(bankfull * 0.7), 2),
        flood: round(stage(bankfull), 2),
        series,
      };
    });

  const worst = hotspots[0];
  const atRisk = hotspots.filter((h) => h.level !== "normal").length;
  const first = hotspots
    .filter((h) => h.minutesToCritical !== null)
    .sort((a, b) => (a.minutesToCritical ?? 0) - (b.minutesToCritical ?? 0))[0];
  const firstCritical = first?.minutesToCritical ?? undefined;
  const rain3h = sumMm(next3h);
  const rain24h = sumMm(next24h);
  const level = floodLevel(worst?.peakRatio ?? 0);
  const peakIntensity = Math.max(0, ...next24h.map((r) => r.intensity));
  const source =
    weather.source === "open-meteo"
      ? "previsão real Open-Meteo"
      : "climatologia (previsão indisponível)";
  const headline =
    mode === "extreme"
      ? first && firstCritical !== undefined
        ? `Tempestade simulada de ${EXTREME_TOTAL} mm em 3 h: ${first.name} atinge nível crítico em ~${firstCritical} min.`
        : `Tempestade simulada de ${EXTREME_TOTAL} mm em 3 h: drenagem no limite, sem ponto crítico.`
      : rain24h < 2
        ? `Sem chuva significativa nas próximas 24 h (${source}). Risco hidrológico baixo.`
        : level === "normal"
          ? `${round(rain24h, 0)} mm previstos em 24 h (${source}): drenagem com folga.`
          : `${round(rain24h, 0)} mm previstos em 24 h (${source}): ${worst?.name ?? "ponto crítico"} pode chegar a ${Math.round((worst?.peakRatio ?? 0) * 100)}% da capacidade.`;

  return {
    generatedAt: new Date(now).toISOString(),
    mode,
    weatherSource: weather.source,
    summary: {
      rain3h: round(rain3h, 1),
      rain24h: round(rain24h, 1),
      peakIntensity: round(peakIntensity, 1),
      level,
      pointsAtRisk: atRisk,
      minutesToFirstCritical: firstCritical ?? null,
      headline,
    },
    forecast: future
      .filter((r) => r.minute % 15 === 0 && r.minute <= (mode === "extreme" ? 240 : 1440))
      .reduce<FloodResponse["forecast"]>((acc, r) => {
        const previous = acc[acc.length - 1]?.accumulated ?? 0;
        acc.push({
          time: formatClock(now + r.minute * MINUTE),
          intensity: round(r.intensity, 1),
          accumulated: round(previous + (r.intensity * 15) / 60, 1),
          origin: r.origin,
        });
        return acc;
      }, []),
    hotspots,
    rivers,
    frames,
    risk,
    susceptibility: susceptibility(),
  };
}
