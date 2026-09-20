import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesCombined, Droplets, Moon, Receipt } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import {
  AgTooltip,
  AXIS,
  CHART_MARGIN,
  ChartFrame,
  ChartLegend,
  GRID,
} from "@/components/aquagraph/charts";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Panel,
  PanelBody,
  PanelHeader,
  TrendPill,
} from "@/components/aquagraph/primitives";
import {
  consumptionCurve,
  consumptionKpis,
  consumptionRows,
  largeConsumers,
} from "@/data/operations";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/consumo")({
  head: pageHead(
    "Consumo",
    "Demanda por setor, padrões horários de uso e acompanhamento de grandes consumidores.",
  ),
  component: ConsumptionPage,
});

function ConsumptionPage() {
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Macromedição agregada a cada 15 min</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            Vazão mínima noturna representa {consumptionKpis.nightFlowShare}% do volume distribuído
          </span>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={Droplets}
          label="Demanda projetada"
          value={consumptionKpis.demand.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          unit="m³/s"
          delta={`▲ ${consumptionKpis.demandTrend}%`}
          deltaTone="negative"
          hint="vs. mesma semana do ano anterior"
          tone="cyan"
          spark={[1.31, 1.34, 1.36, 1.38, 1.4, 1.44, 1.42]}
        />
        <KpiCard
          icon={ChartNoAxesCombined}
          label="Consumo per capita"
          value={String(consumptionKpis.perCapita)}
          unit="L/hab·dia"
          delta="dentro da meta regulatória"
          deltaTone="positive"
          hint="meta ≤ 150 L/hab·dia"
          tone="teal"
          progress={(consumptionKpis.perCapita / 150) * 100}
        />
        <KpiCard
          icon={Receipt}
          label="Volume faturado"
          value={`${consumptionKpis.billedShare}%`}
          delta="▼ 1,4 p.p."
          deltaTone="negative"
          hint="restante compõe perdas aparentes e reais"
          tone="warning"
          progress={consumptionKpis.billedShare}
        />
        <KpiCard
          icon={Moon}
          label="Vazão mínima noturna"
          value={`${consumptionKpis.nightFlowShare}%`}
          delta="indicador de perdas físicas"
          deltaTone="negative"
          hint="medida entre 02h e 04h"
          tone="high"
          spark={[18, 19, 19, 20, 20, 21, 21]}
          sparkKind="bars"
        />
      </KpiStrip>

      <div className="grid-2">
        <Panel>
          <PanelHeader
            title="Curva de consumo horário"
            hint="média da cidade"
            action={
              <ChartLegend
                items={[
                  { label: "Semana atual", color: "var(--ag-cyan)" },
                  { label: "Referência histórica", color: "var(--ag-text-2)", dashed: true },
                ]}
              />
            }
          />
          <PanelBody>
            <ChartFrame height={210}>
              <LineChart data={consumptionCurve} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="hour" {...AXIS} />
                <YAxis domain={[0.6, 1.9]} unit=" m³/s" {...AXIS} width={62} />
                <Tooltip content={<AgTooltip unit=" m³/s" decimals={2} />} />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Semana atual"
                  stroke="var(--ag-cyan)"
                  strokeWidth={2.4}
                  dot={{ r: 2.5, fill: "var(--ag-cyan)", strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="reference"
                  name="Referência histórica"
                  stroke="var(--ag-text-2)"
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ChartFrame>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Demanda por setor" hint="litros por segundo" />
          <PanelBody>
            <ChartFrame height={210}>
              <BarChart data={consumptionRows} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="sector" {...AXIS} />
                <YAxis unit=" L/s" {...AXIS} width={58} />
                <Tooltip
                  content={<AgTooltip unit=" L/s" decimals={0} />}
                  cursor={{ fill: "oklch(0.8276 0.1013 230.32 / 0.06)" }}
                />
                <Bar
                  dataKey="demand"
                  name="Demanda"
                  fill="var(--ag-blue)"
                  fillOpacity={0.62}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartFrame>
          </PanelBody>
        </Panel>
      </div>

      <div className="layout-main">
        <Panel flush>
          <PanelHeader title="Consumo por setor" hint="mês corrente" />
          <table className="data-table is-wide">
            <thead>
              <tr>
                <th>Setor</th>
                <th>Bairro</th>
                <th className="is-numeric">Demanda</th>
                <th className="is-numeric">Per capita</th>
                <th className="is-numeric">Variação</th>
                <th className="is-numeric">Faturado</th>
              </tr>
            </thead>
            <tbody>
              {consumptionRows.map((row) => (
                <tr key={row.sector}>
                  <td>
                    <strong>{row.sector}</strong>
                  </td>
                  <td>{row.district}</td>
                  <td className="is-numeric">{row.demand} L/s</td>
                  <td className="is-numeric">{row.perCapita} L</td>
                  <td className="is-numeric">
                    <TrendPill value={row.variation} suffix="%" />
                  </td>
                  <td className="is-numeric">{row.billedShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <aside className="side-stack">
          <Panel flush>
            <PanelHeader title="Grandes consumidores" hint="top 5" />
            <ul className="asset-list is-padded">
              {largeConsumers.map((consumer, index) => (
                <li key={consumer.name}>
                  <span className="asset-code">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{consumer.name}</strong>
                    <small>
                      Setor {consumer.sector} · {consumer.volume}
                    </small>
                  </div>
                  <TrendPill value={consumer.trend} suffix="%" />
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
