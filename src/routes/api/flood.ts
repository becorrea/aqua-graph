import { createFileRoute } from "@tanstack/react-router";
import { handle, query } from "@/server/http.server";
import { getFlood } from "@/server/sim/flood.server";

/** GET /api/flood?mode=real|extreme — previsão real ou tempestade simulada. */
export const Route = createFileRoute("/api/flood")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const q = query(request);
        return handle(() => getFlood(q.string("mode") === "extreme" ? "extreme" : "real"));
      },
    },
  },
});
