/**
 * Cliente da API do AquaGraph e hooks de dados (TanStack Query).
 *
 * As consultas "ao vivo" são renovadas em segundo plano; respostas pesadas e
 * estáveis (mapa base, Active Sensing) ficam em cache por toda a sessão.
 *
 * Os dados vêm só do navegador (o servidor renderiza o esqueleto). Durante a
 * hidratação os hooks devolvem `data: undefined`, igual ao HTML do servidor —
 * sem isso, uma consulta que termina antes de uma rota carregada sob demanda
 * hidratar provoca divergência de hidratação.
 */
import { useSyncExternalStore } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DecisionsResponse,
  DroughtParams,
  DroughtResponse,
  FloodResponse,
  LeakReplayResponse,
  LiveSnapshot,
  LossesResponse,
  RainMode,
  SensingResponse,
  Decision,
  WorkOrder,
} from "@/types/api";
import type { FeatureCollection, MapBase, PipeProps } from "@/types/geo";
import { useScenario } from "@/components/aquagraph/ScenarioContext";

export class ApiError extends Error {}

const noopSubscribe = () => () => {};

/** `false` enquanto o React hidrata o HTML do servidor; `true` em renderizações no cliente. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Durante a hidratação, devolve um objeto que herda do resultado da consulta
 * mas com `data` vazio. Herdar (em vez de copiar com spread) preserva o
 * rastreamento de propriedades do React Query: o componente só re-renderiza
 * quando muda algo que ele realmente lê.
 */
function clientData<R extends { data: unknown }>(result: R, hydrated: boolean): R {
  if (hydrated) return result;
  const masked = Object.create(result) as R;
  Object.defineProperty(masked, "data", { value: undefined });
  return masked;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Falha ao consultar ${path} (${response.status})`);
  }
  return (await response.json()) as T;
}

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

const LIVE_MS = 30_000;

export function useLive(rainMode: RainMode, installed: number) {
  const hydrated = useHydrated();
  // Espera o cenário salvo na sessão ser restaurado: evita buscar tudo duas vezes.
  const { ready } = useScenario();
  return clientData(
    useQuery({
      queryKey: ["live", rainMode, installed],
      enabled: ready,
      queryFn: () => get<LiveSnapshot>(`/api/live${qs({ rain: rainMode, install: installed })}`),
      refetchInterval: LIVE_MS,
      staleTime: LIVE_MS / 2,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useLosses(sector: string | null) {
  const hydrated = useHydrated();
  return clientData(
    useQuery({
      queryKey: ["losses", sector],
      queryFn: () => get<LossesResponse>(`/api/losses${qs({ sector })}`),
      refetchInterval: 60_000,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useLeakReplay(params: { sector: string | null; size: number | null } | null) {
  const hydrated = useHydrated();
  return clientData(
    useQuery({
      queryKey: ["leak-replay", params?.sector ?? null, params?.size ?? null],
      queryFn: () =>
        get<LeakReplayResponse>(
          `/api/losses-replay${qs({ sector: params?.sector, size: params?.size })}`,
        ),
      enabled: params !== null,
      staleTime: 5 * 60_000,
    }),
    hydrated,
  );
}

export function useDrought(
  system: string | null,
  scenario: string | null,
  custom: DroughtParams | null,
) {
  const hydrated = useHydrated();
  return clientData(
    useQuery({
      queryKey: ["drought", system, scenario, custom],
      queryFn: () =>
        get<DroughtResponse>(
          `/api/drought${qs({
            system,
            scenario,
            pressure: custom?.pressureReduction,
            transfer: custom?.transfer,
            campaign: custom?.campaign,
            rain: custom?.rain,
          })}`,
        ),
      staleTime: 5 * 60_000,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useFlood(mode: RainMode) {
  const hydrated = useHydrated();
  const { ready } = useScenario();
  return clientData(
    useQuery({
      queryKey: ["flood", mode],
      enabled: ready,
      queryFn: () => get<FloodResponse>(`/api/flood${qs({ mode })}`),
      refetchInterval: 120_000,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useSensing(installed: number) {
  const hydrated = useHydrated();
  const { ready } = useScenario();
  return clientData(
    useQuery({
      queryKey: ["sensing", installed],
      enabled: ready,
      queryFn: () => get<SensingResponse>(`/api/sensing${qs({ install: installed })}`),
      staleTime: Infinity,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useDecisions(rainMode: RainMode, installed: number) {
  const hydrated = useHydrated();
  const { ready } = useScenario();
  return clientData(
    useQuery({
      queryKey: ["decisions", rainMode, installed],
      enabled: ready,
      queryFn: () =>
        get<DecisionsResponse>(`/api/decisions${qs({ rain: rainMode, install: installed })}`),
      refetchInterval: 60_000,
      staleTime: 20_000,
      placeholderData: keepPreviousData,
    }),
    hydrated,
  );
}

export function useExecuteDecision(rainMode: RainMode, installed: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, rain: rainMode, install: installed }),
      });
      const body = (await response.json()) as
        { decision: Decision; workOrder: WorkOrder } | { error: string };
      if (!response.ok || "error" in body)
        throw new ApiError("error" in body ? body.error : "Falha ao executar");
      return body;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["decisions"] });
      void client.invalidateQueries({ queryKey: ["live"] });
    },
  });
}

/** Camadas estáticas do mapa (OpenStreetMap processado no build). */
export function useMapBase() {
  const hydrated = useHydrated();
  return clientData(
    useQuery({
      queryKey: ["geo", "base"],
      queryFn: () => get<MapBase>("/geo/rp-base.json"),
      staleTime: Infinity,
      gcTime: Infinity,
    }),
    hydrated,
  );
}

/** Rede secundária (~1 MB): só é baixada quando o mapa aproxima o suficiente. */
export function useSecondaryNetwork(enabled: boolean) {
  const hydrated = useHydrated();
  return clientData(
    useQuery({
      queryKey: ["geo", "secondary"],
      queryFn: () => get<FeatureCollection<PipeProps>>("/geo/rp-secondary.json"),
      enabled,
      staleTime: Infinity,
      gcTime: Infinity,
    }),
    hydrated,
  );
}
