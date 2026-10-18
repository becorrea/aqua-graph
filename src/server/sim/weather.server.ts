/**
 * Clima real via Open-Meteo (sem chave de API).
 *
 * Uma única chamada traz: condição atual, 48 h de previsão horária e 108
 * dias de série diária (92 observados + 16 previstos). O resultado fica em
 * cache por 15 minutos. Se a API não responder, a simulação continua com a
 * climatologia de Ribeirão Preto (normais aproximadas do INMET) e a interface
 * passa a mostrar a origem "climatologia".
 */
import type { Weather, WeatherDay, WeatherHour } from "@/types/api";
import { model } from "../geo/model.server";
import { DAY, HOUR, isoLocal, local, localAt, white } from "./core.server";

const CACHE_MS = 15 * 60_000;
const TIMEOUT_MS = 6000;

/** Normais mensais aproximadas (chuva em mm, máxima média em °C). */
const NORMAL_RAIN = [268, 213, 178, 76, 46, 22, 15, 20, 55, 122, 183, 262];
const NORMAL_TMAX = [30.2, 30.7, 30.4, 29.5, 27.4, 26.6, 27.1, 29.3, 31, 31.3, 30.5, 29.9];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function normalDailyRain(time: number) {
  const m = local(time).month - 1;
  return (NORMAL_RAIN[m] ?? 0) / (DAYS_IN_MONTH[m] ?? 30);
}

export function normalTmax(time: number) {
  return NORMAL_TMAX[local(time).month - 1] ?? 29;
}

const WEATHER_TEXT: Array<[number[], string]> = [
  [[0], "céu limpo"],
  [[1], "predomínio de sol"],
  [[2], "parcialmente nublado"],
  [[3], "nublado"],
  [[45, 48], "nevoeiro"],
  [[51, 53, 55, 56, 57], "garoa"],
  [[61], "chuva fraca"],
  [[63], "chuva moderada"],
  [[65, 66, 67], "chuva forte"],
  [[80, 81], "pancadas de chuva"],
  [[82], "pancadas fortes"],
  [[95, 96, 99], "trovoadas"],
];

export function describeWeather(code: number) {
  return WEATHER_TEXT.find(([codes]) => codes.includes(code))?.[1] ?? "tempo estável";
}

/** Último dado bom, quando foi obtido, e até quando não vale tentar de novo. */
let cache: { at: number; value: Weather } | null = null;
let retryAfter = 0;
let inflight: Promise<Weather> | null = null;

const STALE_LIMIT = 6 * HOUR;
const RETRY_BACKOFF = 2 * 60_000;

/**
 * Stale-while-revalidate: com um dado real de menos de 6 h em mãos, a
 * resposta nunca espera a API — a atualização corre em segundo plano. Só a
 * primeira chamada de uma instância (sem nada em cache) aguarda a busca.
 */
export async function getWeather(): Promise<Weather> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  if (cache && now - cache.at < STALE_LIMIT) {
    if (!inflight && now >= retryAfter) void refresh();
    return cache.value;
  }
  return inflight ?? refresh();
}

function refresh(): Promise<Weather> {
  // Uma nova tentativa antes de recorrer à climatologia: falhas da API
  // costumam ser momentâneas.
  inflight = fetchWeather()
    .catch(() =>
      new Promise<void>((resolve) => setTimeout(resolve, 1500)).then(() => fetchWeather()),
    )
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .catch((error: unknown) => {
      console.warn(
        "[clima] Open-Meteo indisponível, usando fallback:",
        error instanceof Error ? error.message : error,
      );
      retryAfter = Date.now() + RETRY_BACKOFF;
      if (cache && Date.now() - cache.at < STALE_LIMIT) return cache.value;
      // Sem dado real recente: climatologia, marcada como tal na interface.
      const value = climatology(Date.now());
      cache = { at: Date.now() - CACHE_MS + RETRY_BACKOFF, value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

type OpenMeteoResponse = {
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
  };
  hourly?: {
    time: string[];
    precipitation: Array<number | null>;
    precipitation_probability: Array<number | null>;
    temperature_2m: Array<number | null>;
  };
  daily?: {
    time: string[];
    precipitation_sum: Array<number | null>;
    temperature_2m_max: Array<number | null>;
  };
};

async function fetchWeather(): Promise<Weather> {
  const [lon, lat] = model.city.center;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code",
    hourly: "precipitation,precipitation_probability,temperature_2m",
    daily: "precipitation_sum,temperature_2m_max",
    past_days: "92",
    forecast_days: "16",
    forecast_hours: "48",
    past_hours: "24",
    timezone: model.city.timezone,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "AquaGraph/1.0" },
    });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const json = (await response.json()) as OpenMeteoResponse;
    if (!json.current || !json.hourly || !json.daily) throw new Error("Resposta incompleta");

    const today = isoLocal(Date.now()).slice(0, 10);
    const hourly: WeatherHour[] = json.hourly.time.map((time, i) => ({
      time,
      precipitation: json.hourly?.precipitation[i] ?? 0,
      probability: json.hourly?.precipitation_probability[i] ?? 0,
      temperature: json.hourly?.temperature_2m[i] ?? json.current?.temperature_2m ?? 25,
    }));
    const daily: WeatherDay[] = json.daily.time.map((date, i) => ({
      date,
      precipitation: json.daily?.precipitation_sum[i] ?? 0,
      tmax: json.daily?.temperature_2m_max[i] ?? 29,
      observed: date < today,
    }));
    return {
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
      temperature: json.current.temperature_2m,
      humidity: json.current.relative_humidity_2m,
      precipitation: json.current.precipitation,
      weatherCode: json.current.weather_code,
      description: describeWeather(json.current.weather_code),
      hourly,
      daily,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Série sintética a partir das normais, usada quando a API está fora do ar. */
function climatology(now: number): Weather {
  const daily: WeatherDay[] = [];
  for (let d = -92; d < 16; d += 1) {
    const time = localAt(now, d, 12);
    const month = local(time).month - 1;
    const wetChance = Math.min(0.75, (NORMAL_RAIN[month] ?? 0) / 300 + 0.05);
    const roll = (white("clim:rain", d + 1000) + 1) / 2;
    const amount =
      roll < wetChance ? (normalDailyRain(time) / wetChance) * (0.4 + roll / wetChance) : 0;
    daily.push({
      date: isoLocal(time).slice(0, 10),
      precipitation: Math.round(amount * 10) / 10,
      tmax: Math.round((normalTmax(time) + white("clim:t", d + 1000) * 2.2) * 10) / 10,
      observed: d < 0,
    });
  }
  const hourly: WeatherHour[] = [];
  for (let h = -6; h < 48; h += 1) {
    const time = now + h * HOUR;
    hourly.push({
      time: isoLocal(time).slice(0, 13) + ":00",
      precipitation: 0,
      probability: 10,
      temperature: normalTmax(time) - 6 + 6 * Math.sin(((local(time).hour - 9) / 24) * 2 * Math.PI),
    });
  }
  return {
    source: "climatologia",
    fetchedAt: new Date(now).toISOString(),
    temperature: Math.round(hourly[6]?.temperature ?? 25),
    humidity: 60,
    precipitation: 0,
    weatherCode: 1,
    description: "dados climatológicos",
    hourly,
    daily,
  };
}

/** Índice do dia de hoje na série diária. */
export function todayIndex(weather: Weather) {
  const today = isoLocal(Date.now()).slice(0, 10);
  const index = weather.daily.findIndex((day) => day.date === today);
  return index >= 0 ? index : Math.max(0, weather.daily.length - 16);
}

export const DAY_MS = DAY;
