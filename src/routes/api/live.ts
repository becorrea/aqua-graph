import { createFileRoute } from "@tanstack/react-router";
import { handle, query } from "@/server/http.server";
import { readOps } from "@/server/sim/decisions.server";
import { getLive } from "@/server/sim/snapshot.server";

/** GET /api/live?rain=real|extreme&install=0..3 — retrato ao vivo da cidade. */
export const Route = createFileRoute("/api/live")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const q = query(request);
        return handle(() =>
          getLive(
            q.string("rain") === "extreme" ? "extreme" : "real",
            q.number("install", 0, 0, 3),
            readOps(request),
          ),
        );
      },
    },
  },
});
