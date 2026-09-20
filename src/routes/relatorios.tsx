import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText, Gauge, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AgTooltip, AXIS, CHART_MARGIN, ChartFrame, GRID } from "@/components/aquagraph/charts";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelBody,
  PanelHeader,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { regulatoryReports, reportIndicators } from "@/data/operations";
import { lossTrend } from "@/data/leaks";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/relatorios")({
  head: pageHead(
    "Relatórios",
    "Indicadores regulatórios e consolidações operacionais da gestão hídrica municipal.",
  ),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Indicadores fechados até 26 Jan 2026</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Base consolidada a partir de macromedição, faturamento e cadastro de rede
          </span>
        </div>
        <div className="toolbar-right">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.success("Exportação iniciada.", {
                description: "Consolidado de indicadores · Jan 2026",
              })
            }
          >
            <Download />
            Exportar consolidado
          </Button>
        </div>
      </div>

      <KpiStrip columns={3}>
        <KpiCard
          icon={Gauge}
          label="IN049 — Perdas na distribuição"
          value="12,4%"
          delta="▼ 2,1 p.p."
          deltaTone="positive"
          hint="meta regulatória ≤ 15%"
          tone="cyan"
          spark={lossTrend.map((point) => point.loss)}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Conformidade de indicadores"
          value="4 de 6"
          delta="2 em atenção"
          deltaTone="negative"
          hint="frente às metas do ciclo"
          tone="warning"
          progress={67}
        />
        <KpiCard
          icon={FileText}
          label="Relatórios do ciclo"
          value={String(regulatoryReports.length)}
          delta="1 em fechamento"
          deltaTone="neutral"
          hint="obrigações SNIS, ARSESP e PMSB"
          tone="blue"
        />
      </KpiStrip>

      <div className="grid-2">
        <Panel>
          <PanelHeader title="Índice de perdas na distribuição" hint="últimos 12 meses · IN049" />
          <PanelBody>
            <ChartFrame height={206}>
              <AreaChart data={lossTrend} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="ag-report-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ag-teal)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--ag-teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="month" {...AXIS} />
                <YAxis domain={[10, 18]} unit="%" {...AXIS} width={44} />
                <Tooltip content={<AgTooltip unit="%" />} />
                <Area
                  type="monotone"
                  dataKey="loss"
                  name="IN049"
                  stroke="var(--ag-teal)"
                  strokeWidth={2.2}
                  fill="url(#ag-report-fill)"
                />
              </AreaChart>
            </ChartFrame>
          </PanelBody>
        </Panel>

        <Panel flush>
          <PanelHeader title="Indicadores regulatórios" hint="posição atual vs. meta" />
          <ul className="indicator-list">
            {reportIndicators.map((indicator) => (
              <li key={indicator.label}>
                <div>
                  <strong>{indicator.label}</strong>
                  <small>Meta {indicator.target}</small>
                </div>
                <div className="indicator-value">
                  <b>{indicator.value}</b>
                  <StatusBadge level={indicator.level} subtle>
                    {indicator.level === "normal" ? "Conforme" : "Atenção"}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel flush>
        <PanelHeader title="Relatórios e obrigações" hint="ciclo 2025 / 2026" />
        <table className="data-table is-wide">
          <thead>
            <tr>
              <th>Relatório</th>
              <th>Período</th>
              <th>Atualizado</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {regulatoryReports.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>{report.name}</strong>
                  <small>{report.id}</small>
                </td>
                <td>{report.period}</td>
                <td>{report.updated}</td>
                <td>
                  <StatusBadge
                    level={
                      report.status === "Enviado" || report.status === "Consolidado"
                        ? "normal"
                        : "attention"
                    }
                    subtle
                  >
                    {report.status}
                  </StatusBadge>
                </td>
                <td className="is-action">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toast.success("Relatório disponibilizado para download.", {
                        description: `${report.name} · ${report.period}`,
                      })
                    }
                  >
                    Baixar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
