import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BrainCircuit,
  CircleCheck,
  ClipboardList,
  Clock3,
  PlayCircle,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { useScenario } from "@/components/aquagraph/ScenarioContext";
import { moduleMeta } from "@/components/aquagraph/story";
import {
  InfoTip,
  KpiCard,
  KpiStrip,
  LiveTag,
  LoadingBlock,
  OriginBadge,
  Panel,
  PanelBody,
  PanelHeader,
  SegmentedControl,
  StatusBadge,
  StoryBanner,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { useDecisions, useExecuteDecision } from "@/lib/api";
import { formatAge } from "@/lib/format";
import { pageHead } from "@/lib/route-head";
import type { Severity } from "@/types";
import type { Decision, WorkOrder } from "@/types/api";

export const Route = createFileRoute("/decisoes")({
  head: pageHead(
    "Centro de Decisões",
    "Todas as recomendações dos modelos do AquaGraph com impacto estimado, confiança, prioridade e status de execução.",
  ),
  component: DecisionsPage,
});

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "perdas", label: "Perdas" },
  { id: "seca", label: "Seca" },
  { id: "enchentes", label: "Enchente" },
  { id: "sensing", label: "Active Sensing" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const STATUS_LEVEL: Record<Decision["status"], Severity> = {
  Pendente: "critical",
  Simulada: "info",
  Planejada: "attention",
  "Em execução": "high",
  Concluída: "normal",
};

const ORDER_LEVEL: Record<WorkOrder["status"], Severity> = {
  Aberta: "attention",
  "Em execução": "high",
  Concluída: "normal",
};

function DecisionsPage() {
  const scenario = useScenario();
  const decisions = useDecisions(scenario.rainMode, scenario.installed);
  const execute = useExecuteDecision(scenario.rainMode, scenario.installed);
  const [filter, setFilter] = useState<FilterId>("todos");
  const data = decisions.data;

  const rows = useMemo(
    () => (data?.decisions ?? []).filter((row) => filter === "todos" || row.module === filter),
    [data, filter],
  );
  const top = data?.decisions.find((d) => d.status === "Pendente");

  const run = (row: Decision) =>
    execute.mutate(row.id, {
      onSuccess: ({ workOrder }) =>
        toast.success(`${row.action} encaminhada para execução.`, {
          description: `${workOrder.id} · ${workOrder.team} · prazo ${workOrder.deadline}`,
        }),
      onError: (error) => toast.error("Não foi possível executar.", { description: error.message }),
    });

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>
            {data ? `Fila recalculada ${formatAge(data.generatedAt)}` : "Carregando…"}
          </LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Ordenação: prioridade → confiança do modelo. Ordens de serviço ficam registradas no
            servidor.
          </span>
        </div>
        <div className="toolbar-right">
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>

      <StoryBanner
        icon={BrainCircuit}
        level={top ? top.level : "normal"}
        title={top ? `Primeira da fila: ${top.action}` : "Nenhuma recomendação pendente"}
        aside={<OriginBadge origin="modelo" label="Recomendações do modelo" />}
      >
        {top
          ? `${top.rationale} Impacto estimado: ${top.impact}. Confiança ${top.confidence}%.`
          : "Todas as recomendações foram encaminhadas ou concluídas."}
      </StoryBanner>

      <KpiStrip>
        <KpiCard
          icon={Clock3}
          label="Pendentes"
          value={data ? String(data.summary.pending) : "—"}
          delta="aguardando decisão"
          deltaTone="negative"
          hint="geradas pelos modelos agora"
          tone="critical"
        />
        <KpiCard
          icon={PlayCircle}
          label="Em execução"
          value={data ? String(data.summary.running) : "—"}
          delta="equipes em campo"
          deltaTone="neutral"
          hint="com ordem de serviço aberta"
          tone="high"
        />
        <KpiCard
          icon={Workflow}
          label="Simuladas"
          value={data ? String(data.summary.simulated) : "—"}
          delta="prontas para aprovação"
          deltaTone="positive"
          hint="com impacto projetado no teste de estresse"
          tone="blue"
        />
        <KpiCard
          icon={BrainCircuit}
          label="Confiança média"
          info="confianca"
          value={data ? `${data.summary.averageConfidence}%` : "—"}
          hint="média das recomendações abertas"
          tone="success"
          progress={data?.summary.averageConfidence}
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="table-scroll">
          <PanelHeader
            title="Recomendações da inteligência operacional"
            hint={data ? `${rows.length} de ${data.decisions.length}` : ""}
            action={<span className="panel-hint">“Executar” abre a ordem de serviço</span>}
          />
          {data ? (
            <table className="data-table is-wide">
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Local</th>
                  <th className="is-numeric">Impacto</th>
                  <th className="is-numeric">
                    Confiança
                    <InfoTip explain="confianca" />
                  </th>
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
                      <small>
                        <span className="module-tag">{moduleMeta[row.module].label}</span>
                        {row.rationale}
                      </small>
                    </td>
                    <td>
                      {row.place}
                      <small>{row.horizon}</small>
                    </td>
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
                      <StatusBadge level={row.level}>{row.priority}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge level={STATUS_LEVEL[row.status]} subtle>
                        {row.status}
                      </StatusBadge>
                      {row.workOrder && <small>{row.workOrder}</small>}
                    </td>
                    <td className="is-action">
                      {row.status === "Concluída" || row.status === "Em execução" ? (
                        <span className="done-mark">
                          <CircleCheck />
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={execute.isPending}
                          onClick={() => run(row)}
                        >
                          Executar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <LoadingBlock height={360} />
          )}
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader
              title="Ordens de serviço"
              icon={ClipboardList}
              hint={data ? `${data.workOrders.length} registradas` : ""}
            />
            <ul className="order-list">
              {(data?.workOrders ?? []).map((order) => (
                <li key={order.id} className={`level-${ORDER_LEVEL[order.status]}`}>
                  <div>
                    <strong>{order.id}</strong>
                    <StatusBadge level={ORDER_LEVEL[order.status]} subtle>
                      {order.status}
                    </StatusBadge>
                  </div>
                  <span>{order.title}</span>
                  <small>
                    {order.team} · prazo {order.deadline}
                  </small>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Como a fila é priorizada" icon={BrainCircuit} />
            <PanelBody>
              <ol className="ranking-list">
                <li>
                  <strong>Severidade do evento</strong>
                  <small>
                    Probabilidade e impacto estimado sobre o abastecimento ou a segurança
                  </small>
                </li>
                <li>
                  <strong>Confiança do modelo</strong>
                  <small>Quantidade e qualidade da evidência disponível no local</small>
                </li>
                <li>
                  <strong>Retorno operacional</strong>
                  <small>Volume recuperado, dias ganhos ou risco evitado</small>
                </li>
                <li>
                  <strong>Janela de oportunidade</strong>
                  <small>Tempo restante antes de o cenário deixar de ser reversível</small>
                </li>
              </ol>
              <p className="section-note">
                Estimativas de modelo — devem ser validadas em campo antes da execução definitiva.
              </p>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
