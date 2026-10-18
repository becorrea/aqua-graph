import type { SensorReading } from "@/types/api";

/** Número no padrão brasileiro. */
export function num(value: number, digits = 1) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

/** "+3,2" · "−8,8" · "0" */
export function signed(value: number, digits = 1) {
  const text = num(Math.abs(value), digits);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

/** "há 12 s" · "há 3 min" · "às 14:20" */
export function formatAge(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.round(seconds / 60)} min`;
  return `às ${new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
}

export function readingsById(sensors: SensorReading[] | undefined) {
  const map: Record<string, SensorReading> = {};
  for (const sensor of sensors ?? []) map[sensor.id] = sensor;
  return map;
}

/** Dias até criticidade: `null` significa além do horizonte simulado. */
export function daysLabel(days: number | null, horizon = 150) {
  return days === null ? `> ${horizon} dias` : `${days} ${days === 1 ? "dia" : "dias"}`;
}
