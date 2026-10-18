import { createFileRoute } from "@tanstack/react-router";
import { handle, query } from "@/server/http.server";
import { getSensing } from "@/server/sim/sensing.server";

/** GET /api/sensing?install=0..3 — incerteza do modelo e plano de novos sensores. */
export const Route = createFileRoute("/api/sensing")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handle(() => getSensing(query(request).number("install", 0, 0, 3)), { maxAge: 300 }),
    },
  },
});
