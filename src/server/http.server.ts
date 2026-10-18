/**
 * Utilitários HTTP das rotas `/api/*`.
 */

type JsonInit = { maxAge?: number; status?: number; headers?: Record<string, string> };

export function json(data: unknown, { maxAge = 0, status = 200, headers = {} }: JsonInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        maxAge > 0 ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}` : "no-store",
    },
  });
}

export function errorResponse(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : "Erro inesperado";
  return json({ error: message }, { status: 500 });
}

/** Executa o handler devolvendo erros como JSON (nunca como página HTML). */
export async function handle(run: () => unknown | Promise<unknown>, init?: JsonInit) {
  try {
    return json(await run(), init);
  } catch (error) {
    return errorResponse(error);
  }
}

export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  return {
    string: (key: string) => params.get(key),
    number: (key: string, fallback: number, min = -Infinity, max = Infinity) => {
      const raw = params.get(key);
      const value = raw === null || raw === "" ? NaN : Number(raw);
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    },
    bool: (key: string) => params.get(key) === "1" || params.get(key) === "true",
  };
}
