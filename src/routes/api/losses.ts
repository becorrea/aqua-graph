import { createFileRoute } from "@tanstack/react-router";
import { handle, query } from "@/server/http.server";
import { getLosses } from "@/server/sim/losses.server";

/** GET /api/losses?sector=14-B — balanço de perdas, detecção e localização. */
export const Route = createFileRoute("/api/losses")({
  server: {
    handlers: {
      GET: ({ request }) => handle(() => getLosses(query(request).string("sector"))),
    },
  },
});
