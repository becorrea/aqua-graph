import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Clock3, ShieldCheck, Users } from "lucide-react";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelBody,
  PanelHeader,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { fieldTeams, maintenanceKpis, workOrders } from "@/data/operations";
import { pageHead } from "@/lib/route-head";
import type { Severity } from "@/types";

export const Route = createFileRoute("/manutencao")({
  head: pageHead(
    "Manutenção",
    "Ordens de serviço originadas pelo modelo, alocação de equipes e execução em campo.",
  ),
  component: MaintenancePage,
});

const STATUS_LEVEL: Record<string, Severity> = {
  Aberta: "critical",
  "Em execução": "high",
  "Aguardando material": "attention",
  Concluída: "normal",
};

function MaintenancePage() {
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Sincronizado com o aplicativo de campo</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            {workOrders.filter((order) => order.origin !== "Manutenção preventiva").length} das{" "}
            {workOrders.length} ordens foram originadas por recomendação do modelo
          </span>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={ClipboardList}
          label="Ordens abertas"
          value={String(maintenanceKpis.open)}
          delta="aguardando despacho"
          deltaTone="negative"
          hint="prioridade alta ou crítica"
          tone="critical"
        />
        <KpiCard
          icon={Users}
          label="Em execução"
          value={String(maintenanceKpis.running)}
          delta="equipes em campo"
          deltaTone="neutral"
          hint="acompanhamento em tempo real"
          tone="high"
        />
        <KpiCard
          icon={Clock3}
          label="Tempo médio de resposta"
          value={maintenanceKpis.averageResponse.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
          })}
          unit="h"
          delta="▼ 1,3 h no trimestre"
          deltaTone="positive"
          hint="da abertura ao início do serviço"
          tone="cyan"
          spark={[6.4, 6.1, 5.8, 5.2, 4.9, 4.5, 4.2]}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Manutenção preventiva"
          value={`${maintenanceKpis.preventiveShare}%`}
          delta="▲ 9 p.p. no ano"
          deltaTone="positive"
          hint="participação no total de serviços"
          tone="success"
          progress={maintenanceKpis.preventiveShare}
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush>
          <PanelHeader title="Ordens de serviço" hint="janela de 48 h" />
          <table className="data-table is-wide">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Serviço</th>
                <th>Ativo</th>
                <th>Equipe</th>
                <th>Prazo</th>
                <th>Prioridade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                    <small>{order.origin}</small>
                  </td>
                  <td>{order.service}</td>
                  <td>{order.asset}</td>
                  <td>{order.team}</td>
                  <td>{order.deadline}</td>
                  <td>
                    <StatusBadge level={order.level}>{order.priority}</StatusBadge>
                  </td>
                  <td>
                    <StatusBadge level={STATUS_LEVEL[order.status] ?? "normal"} subtle>
                      {order.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <aside className="side-stack">
          <Panel>
            <PanelHeader title="Carga das equipes" icon={Users} />
            <PanelBody>
              <ul className="load-list">
                {fieldTeams.map((team) => (
                  <li key={team.id}>
                    <div className="load-head">
                      <strong>{team.id}</strong>
                      <span>{team.load}%</span>
                    </div>
                    <small>{team.specialty}</small>
                    <div className="load-track">
                      <i
                        className={
                          team.load >= 85 ? "is-critical" : team.load >= 70 ? "is-high" : undefined
                        }
                        style={{ width: `${team.load}%` }}
                      />
                    </div>
                    <i className="load-open">{team.open} ordens ativas</i>
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
