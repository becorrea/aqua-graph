/**
 * Modo Pitch.
 *
 * Conduz a demonstração em cinco etapas, navegando entre os módulos e
 * disparando os cenários de cada tela. As páginas se inscrevem via
 * `useDemoCue`, que devolve um contador incrementado a cada vez que a etapa
 * correspondente entra em cena — assim o mesmo passo pode ser repetido se o
 * apresentador voltar atrás.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Droplets, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type DemoStepId = "overview" | "leaks" | "drought" | "flood" | "sensing";

type DemoStep = {
  id: DemoStepId;
  to: string;
  title: string;
  narrative: string;
};

const openingStep: DemoStep = {
  id: "overview",
  to: "/",
  title: "Visão Geral",
  narrative: "Uma cidade inteira vista como um único sistema hídrico.",
};

export const demoSteps: DemoStep[] = [
  openingStep,
  {
    id: "leaks",
    to: "/perdas",
    title: "Vazamento",
    narrative: "Sinais combinados de pressão e vazão antecipam uma perda física.",
  },
  {
    id: "drought",
    to: "/seca",
    title: "Seca",
    narrative: "Cenários operacionais transformam projeção em resposta preventiva.",
  },
  {
    id: "flood",
    to: "/enchentes",
    title: "Enchente",
    narrative: "Risco hidrológico priorizado em tempo quase real.",
  },
  {
    id: "sensing",
    to: "/active-sensing",
    title: "Active Sensing",
    narrative: "A inteligência indica onde observar para reduzir a incerteza.",
  },
];

function stepAt(index: number): DemoStep {
  return demoSteps[index] ?? openingStep;
}

type DemoContextValue = {
  active: boolean;
  step: number;
  stepId: DemoStepId | null;
  /** Token que muda sempre que a etapa é (re)ativada. */
  cue: number;
  start: () => void;
  stop: () => void;
  goTo: (step: number) => void;
};

const DemoContext = createContext<DemoContextValue>({
  active: false,
  step: 0,
  stepId: null,
  cue: 0,
  start: () => {},
  stop: () => {},
  goTo: () => {},
});

export function useDemo() {
  return useContext(DemoContext);
}

/**
 * Dispara `run` quando a etapa informada entra em cena durante a demonstração.
 */
export function useDemoCue(stepId: DemoStepId, run: () => void) {
  const { active, stepId: current, cue } = useDemo();
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!active || current !== stepId) return;
    const timer = window.setTimeout(() => runRef.current(), 700);
    return () => window.clearTimeout(timer);
  }, [active, current, stepId, cue]);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [cue, setCue] = useState(0);
  const [finished, setFinished] = useState(false);

  const goTo = useCallback(
    (next: number) => {
      if (next >= demoSteps.length) {
        setFinished(true);
        return;
      }
      const safe = Math.max(0, next);
      setStep(safe);
      setCue((value) => value + 1);
      void navigate({ to: stepAt(safe).to });
    },
    [navigate],
  );

  const start = useCallback(() => {
    setActive(true);
    setFinished(false);
    setStep(0);
    setCue((value) => value + 1);
    void navigate({ to: openingStep.to });
  }, [navigate]);

  const stop = useCallback(() => {
    setActive(false);
    setFinished(false);
    setStep(0);
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      active,
      step,
      stepId: active && !finished ? stepAt(step).id : null,
      cue,
      start,
      stop,
      goTo,
    }),
    [active, step, finished, cue, start, stop, goTo],
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {active && !finished && (
          <motion.div
            className="demo-bar"
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <div className="demo-step">
              <span className="demo-step-index">
                Etapa {step + 1} de {demoSteps.length}
              </span>
              <strong>{stepAt(step).title}</strong>
              <small>{stepAt(step).narrative}</small>
            </div>
            <div className="demo-progress" aria-hidden="true">
              {demoSteps.map((item, index) => (
                <i key={item.id} className={cn(index <= step && "is-done")} />
              ))}
            </div>
            <div className="demo-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 0}
                onClick={() => goTo(step - 1)}
              >
                <ChevronLeft />
                Anterior
              </Button>
              <Button size="sm" onClick={() => goTo(step + 1)}>
                {step === demoSteps.length - 1 ? "Concluir" : "Próximo"}
                <ChevronRight />
              </Button>
              <Button variant="ghost" size="sm" onClick={stop}>
                <X />
                Encerrar
              </Button>
            </div>
          </motion.div>
        )}

        {finished && (
          <motion.div
            className="demo-finale"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="demo-finale-inner"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12 }}
            >
              <span className="demo-finale-mark">
                <Droplets />
              </span>
              <h2>
                Aqua<span>Graph</span>
              </h2>
              <p>De monitoramento para decisão.</p>
              <strong>Antecipar · Priorizar · Agir</strong>
              <div className="demo-finale-flow">
                {["Dados", "Inteligência", "Previsão", "Recomendação", "Ação"].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <Button onClick={stop}>Encerrar demonstração</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DemoContext.Provider>
  );
}
