import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  Info,
  RadioTower,
  RotateCcw,
  ScanSearch,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { CityMap } from "@/components/aquagraph/CityMap";
import { useDemoCue } from "@/components/aquagraph/DemoMode";
import {
  KpiCard,
  KpiStrip,
  LiveTag,
  Metric,
  MetricGrid,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SegmentedControl,
  StatusBadge,
  SubTitle,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import {
  sensingCandidates,
  sensingRationale,
  sensingViews,
  sensorRecommendation,
  sensors,
  type SensingView,
} from "@/data/sensors";
import type { MapLayerId } from "@/data/waterNetwork";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/active-sensing")({
  head: pageHead(
    "Active Sensing",
    "A inteligência que indica onde instalar novos sensores para reduzir a incerteza operacional.",
  ),
  component: ActiveSensingPage,
});

const VIEW_LAYERS: Record<SensingView, Partial<Record<MapLayerId, boolean>>> = {
  coverage: { coverage: true, uncertainty: false, recommendation: true },
  uncertainty: { coverage: false, uncertainty: true, recommendation: true },
  recommendation: { coverage: true, uncertainty: true, recommendation: true },
};

function ActiveSensingPage() {
  const [view, setView] = useState<SensingView>("coverage");
  const [installed, setInstalled] = useState(false);

  const coverage = useAnimatedNumber(
    installed ? sensorRecommendation.coverageAfter : sensorRecommendation.coverageBefore,
  );
  const uncertainty = useAnimatedNumber(
    installed ? sensorRecommendation.uncertaintyAfter : sensorRecommendation.uncertaintyBefore,
  );

  const simulate = useCallback(() => {
    setView("recommendation");
    setInstalled(true);
    toast.success("Instalação simulada: +21 p.p. de cobertura, −18 p.p. de incerteza.", {
      description: `${sensorRecommendation.id} · ${sensorRecommendation.location}`,
    });
  }, []);

  useDemoCue("sensing", simulate);

  const coverageGain = sensorRecommendation.coverageAfter - sensorRecommendation.coverageBefore;
  const uncertaintyGain =
    sensorRecommendation.uncertaintyAfter - sensorRecommendation.uncertaintyBefore;

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-explainer">
            <Info />O AquaGraph identifica regiões em que novos sensores gerariam maior ganho de
            informação para o modelo.
          </span>
        </div>
        <div className="toolbar-right">
          <SegmentedControl options={sensingViews} value={view} onChange={setView} />
          {installed ? (
            <Button variant="outline" size="sm" onClick={() => setInstalled(false)}>
              <RotateCcw />
              Reverter simulação
            </Button>
          ) : (
            <Button variant="operational" size="sm" onClick={simulate}>
              <Sparkles />
              Simular instalação
            </Button>
          )}
        </div>
      </div>

      <KpiStrip>
        <KpiCard
          icon={ScanSearch}
          label="Cobertura informacional"
          value={`${Math.round(coverage)}%`}
          delta={installed ? `▲ ${coverageGain} p.p.` : "linha de base atual"}
          deltaTone={installed ? "positive" : "neutral"}
          hint="proporção da rede explicada pela telemetria"
          tone="cyan"
          progress={coverage}
        />
        <KpiCard
          icon={TriangleAlert}
          label="Incerteza do modelo"
          value={`${Math.round(uncertainty)}%`}
          delta={installed ? `▼ ${Math.abs(uncertaintyGain)} p.p.` : "acima do limite aceitável"}
          deltaTone={installed ? "positive" : "negative"}
          hint="entropia média das estimativas por setor"
          tone={installed ? "success" : "warning"}
          progress={uncertainty}
        />
        <KpiCard
          icon={RadioTower}
          label="Pontos de telemetria"
          value={String(sensors.length + (installed ? 1 : 0))}
          delta={installed ? "▲ 1 simulado" : "em operação"}
          deltaTone={installed ? "positive" : "neutral"}
          hint="pressão, vazão, nível e qualidade"
          tone="blue"
          spark={[12, 13, 14, 15, 16, 17, 18]}
          sparkKind="bars"
        />
        <KpiCard
          icon={BrainCircuit}
          label="Detecção antecipada"
          value={`+${sensorRecommendation.earlyDetectionGain}%`}
          delta={`confiança ${sensorRecommendation.confidence}%`}
          deltaTone="positive"
          hint="ganho estimado no tempo de detecção"
          tone="success"
        />
      </KpiStrip>

      <div className="layout-main">
        <Panel flush className="map-panel">
          <PanelHeader
            title="Cobertura e incerteza informacional"
            hint={`${sensors.length} pontos instalados`}
            action={
              <>
                <StatusBadge level={installed ? "normal" : "attention"}>
                  {installed ? "S-27 simulado" : "lacuna no nordeste"}
                </StatusBadge>
                <LiveTag>modelo recalculado há 12 min</LiveTag>
              </>
            }
          />
          <CityMap
            variant="sensing"
            sensingView={view}
            sensorInstalled={installed}
            overrideLayers={VIEW_LAYERS[view]}
            sectorLabels="codes"
          />
        </Panel>

        <aside className="side-stack">
          <Panel>
            <PanelHeader
              title={`Recomendação ${sensorRecommendation.id}`}
              icon={Sparkles}
              action={<StatusBadge level="high">Prioridade alta</StatusBadge>}
            />
            <PanelBody>
              <div className="recommendation-head">
                <span>Local</span>
                <strong>{sensorRecommendation.location}</strong>
                <span>Tipo</span>
                <strong>{sensorRecommendation.type}</strong>
              </div>
              <SubTitle>Ganho estimado</SubTitle>
              <MetricGrid columns={2}>
                <Metric
                  label="Cobertura informacional"
                  value={`${sensorRecommendation.coverageBefore}% → ${sensorRecommendation.coverageAfter}%`}
                  tone="cyan"
                />
                <Metric
                  label="Incerteza"
                  value={`${sensorRecommendation.uncertaintyBefore}% → ${sensorRecommendation.uncertaintyAfter}%`}
                  tone="success"
                />
                <Metric
                  label="Detecção antecipada"
                  value={`+${sensorRecommendation.earlyDetectionGain}%`}
                  tone="teal"
                />
                <Metric
                  label="Área beneficiada"
                  value={`${sensorRecommendation.sectorsBenefited} setores`}
                  hint="17-C · 33-G · 41-H"
                />
              </MetricGrid>
              <p className="section-note">
                Investimento estimado de {sensorRecommendation.estimatedCost} com retorno projetado
                em {sensorRecommendation.payback}, considerando a redução de perdas não
                contabilizadas nos setores atendidos.
              </p>
            </PanelBody>
            <PanelFooter>
              <Button
                variant={installed ? "outline" : "operational"}
                className="w-full"
                onClick={installed ? () => setInstalled(false) : simulate}
              >
                {installed ? "Reverter simulação" : "Simular instalação"}
              </Button>
            </PanelFooter>
          </Panel>

          <Panel flush>
            <PanelHeader title="Por que este local?" icon={BrainCircuit} />
            <ul className="rationale-list">
              {sensingRationale.map((item) => (
                <li key={item.title}>
                  <div className="rationale-main">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <div className="rationale-weight">
                    <i style={{ width: `${item.weight}%` }} />
                    <b>{item.weight}</b>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <div className="grid-2">
        <Panel>
          <PanelHeader
            title="Simulação antes / depois"
            hint={installed ? "com S-27 instalado" : "cenário atual"}
          />
          <PanelBody>
            <div className="compare">
              <div className="compare-card">
                <span className="compare-tag">Antes</span>
                <div className="compare-metric">
                  <small>Cobertura</small>
                  <strong>{sensorRecommendation.coverageBefore}%</strong>
                  <i>
                    <b
                      className="tone-warning"
                      style={{ width: `${sensorRecommendation.coverageBefore}%` }}
                    />
                  </i>
                </div>
                <div className="compare-metric">
                  <small>Incerteza</small>
                  <strong>{sensorRecommendation.uncertaintyBefore}%</strong>
                  <i>
                    <b
                      className="tone-critical"
                      style={{ width: `${sensorRecommendation.uncertaintyBefore}%` }}
                    />
                  </i>
                </div>
              </div>

              <span className="compare-arrow">
                <ArrowRight />
              </span>

              <div className={`compare-card ${installed ? "is-active" : ""}`}>
                <span className="compare-tag is-after">Depois</span>
                <div className="compare-metric">
                  <small>Cobertura</small>
                  <strong>{sensorRecommendation.coverageAfter}%</strong>
                  <i>
                    <b
                      className="tone-cyan"
                      style={{ width: `${sensorRecommendation.coverageAfter}%` }}
                    />
                  </i>
                </div>
                <div className="compare-metric">
                  <small>Incerteza</small>
                  <strong>{sensorRecommendation.uncertaintyAfter}%</strong>
                  <i>
                    <b
                      className="tone-success"
                      style={{ width: `${sensorRecommendation.uncertaintyAfter}%` }}
                    />
                  </i>
                </div>
              </div>
            </div>
            <div className="gain-row">
              <StatusBadge level="normal">+{coverageGain} p.p. de cobertura</StatusBadge>
              <StatusBadge level="normal">{uncertaintyGain} p.p. de incerteza</StatusBadge>
              <span className="panel-hint">
                Valores estimados pelo modelo de ganho informacional, não medições.
              </span>
            </div>
          </PanelBody>
        </Panel>

        <Panel flush>
          <PanelHeader title="Locais candidatos" hint="ranking por ganho informacional" />
          <table className="data-table">
            <thead>
              <tr>
                <th>Sensor</th>
                <th>Local</th>
                <th className="is-numeric">Cobertura</th>
                <th className="is-numeric">Incerteza</th>
                <th>Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {sensingCandidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className={candidate.id === "S-27" ? "is-highlight" : undefined}
                >
                  <td>
                    <strong>{candidate.id}</strong>
                  </td>
                  <td>{candidate.location}</td>
                  <td className="is-numeric text-success">+{candidate.gain} p.p.</td>
                  <td className="is-numeric text-cyan">{candidate.uncertainty} p.p.</td>
                  <td>
                    <StatusBadge
                      level={
                        candidate.priority === "Alta"
                          ? "high"
                          : candidate.priority === "Média"
                            ? "attention"
                            : "normal"
                      }
                      subtle
                    >
                      {candidate.priority}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
