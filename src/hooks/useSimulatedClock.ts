import { useEffect, useState } from "react";

/**
 * Relógio da sala de operação.
 *
 * Começa exatamente no horário informado — o primeiro render é igual no
 * servidor e no cliente, evitando divergência de hidratação — e só então passa
 * a avançar.
 */
export function useSimulatedClock(start: string, minutesPerTick = 1, intervalMs = 15_000) {
  const [minutes, setMinutes] = useState(() => {
    const parts = start.split(":");
    return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
  });

  useEffect(() => {
    const timer = window.setInterval(
      () => setMinutes((current) => (current + minutesPerTick) % (24 * 60)),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [minutesPerTick, intervalMs]);

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
