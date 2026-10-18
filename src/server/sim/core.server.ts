/**
 * Núcleo do motor de simulação: relógio local, ruído determinístico e curva
 * de consumo.
 *
 * Toda leitura simulada é uma função pura de (sensor, instante). Duas
 * chamadas para o mesmo minuto devolvem o mesmo valor — em qualquer servidor,
 * sem estado compartilhado — e o histórico de 24 h é sempre coerente com a
 * leitura "ao vivo".
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** São Paulo não tem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET = -3 * HOUR;

export type LocalTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  minuteOfDay: number;
  dayOfYear: number;
};

/** Cache por minuto: a simulação pede o mesmo instante para vários setores. */
const localCache = new Map<number, LocalTime>();

export function local(time: number): LocalTime {
  const key = Math.floor(time / MINUTE);
  const hit = localCache.get(key);
  if (hit) return hit;
  const value = computeLocal(key * MINUTE);
  if (localCache.size > 20_000) localCache.clear();
  localCache.set(key, value);
  return value;
}

function computeLocal(time: number): LocalTime {
  const d = new Date(time + OFFSET);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dayOfYear: Math.floor((d.getTime() - start) / DAY) + 1,
  };
}

/** Instante UTC de uma hora local de um dia relativo ao dia de `time`. */
export function localAt(time: number, dayOffset: number, hour: number, minute = 0) {
  const d = new Date(time + OFFSET);
  return (
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, hour, minute) - OFFSET
  );
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const pad = (value: number) => String(value).padStart(2, "0");

export function formatClock(time: number) {
  const t = local(time);
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

export function formatDate(time: number) {
  const t = local(time);
  return `${WEEKDAYS[t.weekday]}, ${t.day} ${MONTHS[t.month - 1]} ${t.year}`;
}

export function formatDay(time: number) {
  const t = local(time);
  return `${pad(t.day)}/${pad(t.month)}`;
}

/** "hoje, 03:10" · "ontem, 23:40" · "12/10, 08:00" */
export function formatRelative(time: number, now: number) {
  const days = Math.round((localAt(now, 0, 0) - localAt(time, 0, 0)) / DAY);
  const prefix = days === 0 ? "hoje" : days === 1 ? "ontem" : formatDay(time);
  return `${prefix}, ${formatClock(time)}`;
}

export function isoLocal(time: number) {
  const t = local(time);
  return `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
}

// ---------------------------------------------------------------------------
// Ruído determinístico
// ---------------------------------------------------------------------------

export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Valor pseudoaleatório em [-1, 1] para uma chave e um índice inteiro. */
export function white(key: string, index: number) {
  return (hash(`${key}#${index}`) / 4294967295) * 2 - 1;
}

// Ruído de sensor: chamado centenas de milhares de vezes por requisição. O
// hash da chave é calculado uma vez; o índice entra por mistura inteira
// (finalizador do MurmurHash3), sem montar strings.
const keyHashes = new Map<string, number>();

function keyHash(key: string) {
  let h = keyHashes.get(key);
  if (h === undefined) {
    h = hash(key);
    keyHashes.set(key, h);
  }
  return h;
}

function mixWhite(seed: number, index: number) {
  let x = (seed ^ Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
}

function smoothFromSeed(seed: number, time: number, periodMinutes: number) {
  const position = time / MINUTE / periodMinutes;
  const i = Math.floor(position);
  const f = position - i;
  const ease = (1 - Math.cos(f * Math.PI)) / 2;
  return mixWhite(seed, i) * (1 - ease) + mixWhite(seed, i + 1) * ease;
}

/**
 * Ruído suave em [-1, 1]: interpola valores aleatórios espaçados de
 * `periodMinutes`. Imita a variação lenta de uma rede real.
 */
export function smoothNoise(key: string, time: number, periodMinutes = 45) {
  return smoothFromSeed(keyHash(key), time, periodMinutes);
}

const sensorSeeds = new Map<string, [number, number]>();

/** Combinação de ruído lento (tendência) e rápido (leitura). */
export function sensorNoise(key: string, time: number) {
  let seeds = sensorSeeds.get(key);
  if (!seeds) {
    seeds = [keyHash(`${key}:slow`), keyHash(`${key}:fast`)];
    sensorSeeds.set(key, seeds);
  }
  return 0.7 * smoothFromSeed(seeds[0], time, 55) + 0.3 * smoothFromSeed(seeds[1], time, 7);
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Número no padrão brasileiro para textos gerados ("−8,8", "1.234"). */
export function ptn(value: number, digits = 1, signed = false) {
  const text = Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
  if (value < 0) return `−${text}`;
  return signed && value > 0 ? `+${text}` : text;
}
export const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// ---------------------------------------------------------------------------
// Curva de consumo residencial (fator horário, média = 1)
// ---------------------------------------------------------------------------

const HOURLY_PATTERN = [
  0.52, 0.44, 0.39, 0.37, 0.39, 0.53, 0.86, 1.26, 1.42, 1.34, 1.24, 1.19, 1.24, 1.16, 1.06, 1.01,
  1.06, 1.2, 1.36, 1.42, 1.27, 1.06, 0.86, 0.68,
];
const PATTERN_MEAN = HOURLY_PATTERN.reduce((sum, value) => sum + value, 0) / HOURLY_PATTERN.length;

/** Fator de consumo no minuto do dia, com interpolação suave entre as horas. */
export function demandFactor(time: number, localTime?: LocalTime) {
  const t = localTime ?? local(time);
  const position = t.minuteOfDay / 60;
  const h = Math.floor(position) % 24;
  const f = position - Math.floor(position);
  const a = HOURLY_PATTERN[h] ?? 1;
  const b = HOURLY_PATTERN[(h + 1) % 24] ?? 1;
  const ease = (1 - Math.cos(f * Math.PI)) / 2;
  const weekend = t.weekday === 0 || t.weekday === 6 ? (t.hour < 9 ? 0.86 : 1.04) : 1;
  return ((a * (1 - ease) + b * ease) / PATTERN_MEAN) * weekend;
}

export const MIN_DEMAND_FACTOR = Math.min(...HOURLY_PATTERN) / PATTERN_MEAN;
export const PEAK_DEMAND_FACTOR = Math.max(...HOURLY_PATTERN) / PATTERN_MEAN;

/** Memória simples por chave, com expiração — evita recalcular a cada requisição. */
export function memo<T>(ttlMs: number) {
  const store = new Map<string, { at: number; value: T }>();
  return (key: string, produce: () => T): T => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    const value = produce();
    store.set(key, { at: now, value });
    if (store.size > 64) {
      const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) store.delete(oldest[0]);
    }
    return value;
  };
}

/** Versão assíncrona de `memo`: compartilha a mesma promessa entre chamadas simultâneas. */
export function memoAsync<T>(ttlMs: number) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, produce: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    const value = produce().catch((error: unknown) => {
      store.delete(key);
      throw error;
    });
    store.set(key, { at: now, value });
    for (const [k, entry] of store) if (now - entry.at > ttlMs) store.delete(k);
    return value;
  };
}
