/**
 * Cenário de simulação compartilhado entre as telas.
 *
 * Uma tempestade simulada em "Enchentes" ou sensores instalados em "Active
 * Sensing" precisam aparecer também na visão geral e no centro de decisões —
 * por isso o cenário vive acima das rotas e entra em todas as consultas à
 * API. Fica salvo na sessão do navegador para sobreviver a um F5.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RainMode } from "@/types/api";

type ScenarioValue = {
  rainMode: RainMode;
  installed: number;
  /** Algum cenário diferente da situação real está ativo. */
  simulated: boolean;
  /** O cenário salvo na sessão já foi restaurado (as consultas esperam por isso). */
  ready: boolean;
  setRainMode: (mode: RainMode) => void;
  setInstalled: (count: number) => void;
  reset: () => void;
};

const ScenarioContext = createContext<ScenarioValue>({
  rainMode: "real",
  installed: 0,
  simulated: false,
  ready: false,
  setRainMode: () => {},
  setInstalled: () => {},
  reset: () => {},
});

const STORAGE_KEY = "aquagraph:scenario";

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [rainMode, setRainMode] = useState<RainMode>("real");
  const [installed, setInstalled] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as {
        rainMode?: RainMode;
        installed?: number;
      } | null;
      if (saved?.rainMode === "extreme") setRainMode("extreme");
      if (typeof saved?.installed === "number")
        setInstalled(Math.max(0, Math.min(3, saved.installed)));
    } catch {
      // Armazenamento indisponível (aba anônima): segue com o cenário real.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ rainMode, installed }));
    } catch {
      // Sem persistência: o cenário vale só para esta página.
    }
  }, [rainMode, installed, ready]);

  const reset = useCallback(() => {
    setRainMode("real");
    setInstalled(0);
  }, []);

  const value = useMemo(
    () => ({
      rainMode,
      installed,
      simulated: rainMode !== "real" || installed > 0,
      ready,
      setRainMode,
      setInstalled,
      reset,
    }),
    [rainMode, installed, ready, reset],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario() {
  return useContext(ScenarioContext);
}
