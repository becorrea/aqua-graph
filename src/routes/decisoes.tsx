import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BrainCircuit, CircleCheck, Clock3, PlayCircle, Workflow } from "lucide-react";
import { toast } from "sonner";
import { ActionList } from "@/components/aquagraph/lists";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelBody,
  PanelHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { decisionRows, decisionSummary, overviewActions } from "@/data/recommendations";
import { pageHead } from "@/lib/route-head";
import type { DecisionRow, Severity } from "@/types";

export const Route = createFileRoute("/decisoes")({
  head: pageHead(
    "Centro de Decisões",
    "Todas as recomendações do modelo com impacto estimado, confiança, prioridade e status de execução.",
  ),
  component: DecisionsPage,
});

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "Perdas", label: "Perdas" },
  { id: "Seca", label: "Seca" },
  { id: "Enchente", label: "Enchente" },
  { id: "Active Sensing", label: "Active Sensing" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const STATUS_LEVEL: Record<DecisionRow["status"], Severity> = {
  Pendente: "critical",
  Simulada: "info",
  Planejada: "attention",
  "Em execução": "high",
  Concluída: "normal",
};

const PRIORITY_LEVEL: Record<DecisionRow["priority"], Severity> = {
  Crítica: "critical",
  Alta: "high",
  Média: "attention",
  Baixa: "normal",
};

function DecisionsPage() {
  const [filter, setFilter] = useState<FilterId>("todos");

  const rows = useMemo(
    () => (filter === "todos" ? decisionRows : decisionRows.filter((row) => row.type === filter)),
    [filter],
  );

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Fila recalculada a cada 5 minutos</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Ordenação por retorno operacional estimado × confiança do modelo
          </span>
        </div>
        <div className="toolbar-right">
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={Clock3}
          label="Recomendações pendentes"
          value={String(decisionSummary.open)}
          delta="aguardando decisão"
          deltaTone="negative"
          hint="prioridade crítica ou alta"
          tone="critical"
        />
        <KpiCard
          icon={PlayCircle}
          label="Em execução"
          value={String(decisionSummary.running)}
          delta="equipes em campo"
          deltaTone="neutral"
          hint="acompanhamento em tempo real"
          tone="high"
        />
        <KpiCard
          icon={Workflow}
          label="Cenários simulados"
          value={String(decisionSummary.simulated)}
          delta="prontos para aprovação"
          deltaTone="positive"
          hint="com impacto projetado"
          tone="blue"
        />
        <KpiCard
          icon={BrainCircuit}
          label="Confiança média"
          value={`${decisionSummary.averageConfidence}%`}
          delta="alta confiabilidade"
          deltaTone="positive"
          hint="média ponderada das recomendações"
          tone="success"
          progress={decisionSummary.averageConfidence}
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush>
          <PanelHeader
            title="Recomendações da inteligência operacional"
            hint={`${rows.length} de ${decisionRows.length}`}
            action={<span className="panel-hint">clique em executar para gerar a ordem</span>}
          />
          <table className="data-table is-wide">
            <thead>
              <tr>
                <th>Ação</th>
                <th>Tipo</th>
                <th>Local</th>
                <th className="is-numeric">Impacto</th>
                <th className="is-numeric">Confiança</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.action}</strong>
                    <small>{row.id}</small>
                  </td>
                  <td>{row.type}</td>
                  <td>{row.place}</td>
                  <td className="is-numeric">{row.impact}</td>
                  <td className="is-numeric">
                    <span className="confidence-inline">
                      <i>
                        <b style={{ width: `${row.confidence}%` }} />
                      </i>
                      {row.confidence}%
                    </span>
                  </td>
                  <td>
                    <StatusBadge level={PRIORITY_LEVEL[row.priority]}>{row.priority}</StatusBadge>
                  </td>
                  <td>
                    <StatusBadge level={STATUS_LEVEL[row.status]} subtle>
                      {row.status}
                    </StatusBadge>
                  </td>
                  <td className="is-action">
                    {row.status === "Concluída" ? (
                      <span className="done-mark">
                        <CircleCheck />
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          toast.success(`${row.action} encaminhada para execução.`, {
                            description: `${row.id} · ${row.place} · confiança ${row.confidence}%`,
                          })
                        }
                      >
                        Executar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader title="Próximas 4 horas" icon={Clock3} />
            <ActionList
              items={overviewActions.map((action) => ({
                id: action.id,
                action: action.action,
                rationale: action.rationale,
                priority: action.priority,
                level: action.level,
                time: action.horizon,
                module: action.module,
              }))}
              numbered={false}
            />
          </Panel>

          <Panel>
            <PanelHeader title="Como a fila é priorizada" icon={BrainCircuit} />
            <PanelBody>
              <ol className="ranking-list">
                <li>
                  <strong>Severidade do evento</strong>
                  <small>Probabilidade e impacto estimado sobre o abastecimento</small>
                </li>
                <li>
                  <strong>Confiança do modelo</strong>
                  <small>Quantidade e qualidade da evidência disponível no setor</small>
                </li>
                <li>
                  <strong>Retorno operacional</strong>
                  <small>Volume recuperado, dias ganhos ou risco evitado por hora de equipe</small>
                </li>
                <li>
                  <strong>Janela de oportunidade</strong>
                  <small>Tempo restante antes de o cenário deixar de ser reversível</small>
                </li>
              </ol>
              <p className="section-note">
                Todas as estimativas são projeções de modelo e devem ser validadas em campo antes da
                execução definitiva.
              </p>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
