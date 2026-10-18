import { createFileRoute } from "@tanstack/react-router";
import { handle, query } from "@/server/http.server";
import { getLeakReplay } from "@/server/sim/losses.server";

/**
 * GET /api/losses-replay — reconstrói hora a hora a detecção do vazamento do
 * setor 14-B. Com `?sector=08-C&size=10` simula um vazamento hipotético de
 * 10 L/s começando agora e mostra quando o modelo o detectaria.
 */
export const Route = createFileRoute("/api/losses-replay")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const q = query(request);
        const size = q.string("size");
        return handle(() =>
          getLeakReplay(q.string("sector"), size ? q.number("size", 10, 1, 40) : null),
        );
      },
    },
  },
});
