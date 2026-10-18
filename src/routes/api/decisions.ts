import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, handle, json, query } from "@/server/http.server";
import { executeDecision, getDecisions, opsCookie, readOps } from "@/server/sim/decisions.server";

/**
 * GET  /api/decisions?rain=real|extreme&install=0..3 — fila consolidada.
 * POST /api/decisions { id } — executa a recomendação e abre a ordem de serviço.
 *
 * As ordens abertas ficam no cookie `ag_ops` (ver decisions.server.ts), o que
 * mantém a fila consistente mesmo quando cada requisição cai numa instância
 * diferente do servidor.
 */
export const Route = createFileRoute("/api/decisions")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const q = query(request);
        return handle(() =>
          getDecisions(
            q.string("rain") === "extreme" ? "extreme" : "real",
            q.number("install", 0, 0, 3),
            readOps(request),
          ),
        );
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            id?: unknown;
            rain?: unknown;
            install?: unknown;
          };
          if (typeof body.id !== "string")
            return json({ error: "Informe o id da recomendação" }, { status: 400 });
          const rain = body.rain === "extreme" ? "extreme" : "real";
          const install =
            typeof body.install === "number" ? Math.max(0, Math.min(3, body.install)) : 0;
          const { decision, workOrder, ops } = await executeDecision(
            body.id,
            rain,
            install,
            readOps(request),
          );
          return json({ decision, workOrder }, { headers: { "set-cookie": opsCookie(ops) } });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
