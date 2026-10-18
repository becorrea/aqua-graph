import { createFileRoute } from "@tanstack/react-router";
import type { DroughtParams } from "@/types/api";
import { handle, query } from "@/server/http.server";
import { getDrought } from "@/server/sim/drought.server";

/**
 * GET /api/drought?system=sul&scenario=pressao
 * GET /api/drought?system=sul&pressure=12&transfer=1&campaign=0&rain=abaixo  (simulador)
 */
export const Route = createFileRoute("/api/drought")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const q = query(request);
        const rain = q.string("rain");
        const custom: DroughtParams | null =
          q.string("pressure") !== null
            ? {
                pressureReduction: q.number("pressure", 0, 0, 20),
                transfer: q.bool("transfer"),
                campaign: q.bool("campaign"),
                rain: rain === "abaixo" || rain === "critica" ? rain : "normal",
              }
            : null;
        return handle(() =>
          getDrought({ system: q.string("system"), scenario: q.string("scenario"), custom }),
        );
      },
    },
  },
});
