import { createFileRoute } from "@tanstack/react-router";
import { handle } from "@/server/http.server";
import { getWeather } from "@/server/sim/weather.server";

/** GET /api/weather — clima real (Open-Meteo) usado pelo motor, com cache de 15 min. */
export const Route = createFileRoute("/api/weather")({
  server: {
    handlers: {
      GET: () => handle(() => getWeather(), { maxAge: 300 }),
    },
  },
});
