import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Network, Route as RouteIcon, Wrench } from "lucide-react";
import { CityMap } from "@/components/aquagraph/CityMap";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Metric,
  MetricGrid,
  Panel,
  PanelBody,
  PanelHeader,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { infrastructureKpis, infrastructureRows } from "@/data/operations";
import { networkSummary, pumpStations, trunkMains } from "@/data/waterNetwork";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/infraestrutura")({
  head: pageHead(
    "Rede e Infraestrutura",
    "Cadastro técnico da rede, idade dos ativos e criticidade estrutural por setor.",
  ),
  component: InfrastructurePage,
});

function InfrastructurePage() {
  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Cadastro sincronizado com o GIS há 6 h</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            {networkSummary.valves} válvulas · {networkSummary.pumpStations} elevatórias ·{" "}
            {networkSummary.reservoirs} reservatórios
          </span>
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={RouteIcon}
          label="Extensão de rede"
          value={infrastructureKpis.extension.toLocaleString("pt-BR")}
          unit="km"
          delta="cadastro consolidado"
          deltaTone="neutral"
          hint="adutoras, rede primária e secundária"
          tone="cyan"
        />
        <KpiCard
          icon={CalendarClock}
          label="Idade média da rede"
          value={infrastructureKpis.averageAge.toLocaleString("pt-BR")}
          unit="anos"
          delta="▲ 1,2 no ano"
          deltaTone="negative"
          hint="ponderada por extensão"
          tone="warning"
          spark={[23, 24, 24.8, 25.6, 26.3, 27, 27.5]}
        />
        <KpiCard
          icon={Network}
          label="Ferro fundido"
          value={`${infrastructureKpis.ironShare}%`}
          delta="material com maior taxa de ruptura"
          deltaTone="negative"
          hint="prioridade de substituição"
          tone="high"
          progress={infrastructureKpis.ironShare}
        />
        <KpiCard
          icon={Wrench}
          label="Ativos monitorados"
          value={String(infrastructureKpis.assets)}
          delta="válvulas, bombas e medidores"
          deltaTone="neutral"
          hint="com ficha técnica completa"
          tone="blue"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Rede hidráulica cadastrada"
            hint="adutoras, rede de distribuição e ativos"
          />
          <CityMap variant="overview" sectorLabels="codes" />
        </Panel>

        <aside className="side-stack">
          <Panel>
            <PanelHeader title="Adutoras principais" icon={Network} />
            <PanelBody>
              <ul className="asset-list">
                {trunkMains.map((main) => (
                  <li key={main.id}>
                    <span className="asset-code">{main.id}</span>
                    <div>
                      <strong>{main.label}</strong>
                      <small>{main.diameter}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Estações elevatórias" icon={Wrench} />
            <PanelBody>
              <MetricGrid columns={2}>
                {pumpStations.map((pump) => (
                  <Metric
                    key={pump.id}
                    label={pump.id}
                    value={pump.level === "normal" ? "Operando" : "Atenção"}
                    tone={pump.level === "normal" ? "success" : "warning"}
                    hint={pump.detail}
                  />
                ))}
              </MetricGrid>
            </PanelBody>
          </Panel>
        </aside>
      </div>

      <Panel flush>
        <PanelHeader
          title="Criticidade estrutural por setor"
          hint="ordenado por idade média da rede"
        />
        <table className="data-table is-wide">
          <thead>
            <tr>
              <th>Setor</th>
              <th>Bairro</th>
              <th className="is-numeric">Extensão</th>
              <th className="is-numeric">Idade média</th>
              <th className="is-numeric">Ferro fundido</th>
              <th className="is-numeric">Rupturas / ano</th>
              <th>Criticidade</th>
            </tr>
          </thead>
          <tbody>
            {infrastructureRows.map((row) => (
              <tr key={row.sector}>
                <td>
                  <strong>{row.sector}</strong>
                </td>
                <td>{row.district}</td>
                <td className="is-numeric">{row.extension} km</td>
                <td className="is-numeric">{row.averageAge} anos</td>
                <td className="is-numeric">{row.ironShare}%</td>
                <td className="is-numeric">{row.breaksPerYear}</td>
                <td>
                  <StatusBadge level={row.criticality} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
