import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Plug, SlidersHorizontal, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  LiveTag,
  Metric,
  MetricGrid,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  StatusBadge,
} from "@/components/aquagraph/primitives";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { city } from "@/data/city";
import { alertChannels, integrations, modelSettings } from "@/data/operations";
import { networkSummary } from "@/data/waterNetwork";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/configuracoes")({
  head: pageHead(
    "Configurações",
    "Parâmetros dos modelos preditivos, canais de alerta e integrações da plataforma.",
  ),
  component: SettingsPage,
});

function SettingsPage() {
  const [thresholds, setThresholds] = useState<Record<string, number>>(() =>
    Object.fromEntries(modelSettings.map((setting) => [setting.id, setting.value])),
  );
  const [channels, setChannels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(alertChannels.map((channel) => [channel.id, channel.enabled])),
  );

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <LiveTag>Alterações aplicadas apenas ao ambiente de demonstração</LiveTag>
          <span className="toolbar-divider" />
          <span className="toolbar-note">
            {city.name} — {city.state} · {networkSummary.telemetryPoints} pontos de telemetria
          </span>
        </div>
        <div className="toolbar-right">
          <Button
            variant="operational"
            size="sm"
            onClick={() => toast.success("Parâmetros do modelo atualizados.")}
          >
            Salvar parâmetros
          </Button>
        </div>
      </div>

      <div className="grid-2">
        <Panel>
          <PanelHeader title="Parâmetros dos modelos" icon={SlidersHorizontal} />
          <PanelBody>
            <div className="settings-list">
              {modelSettings.map((setting) => (
                <div className="settings-row" key={setting.id}>
                  <div className="settings-copy">
                    <strong>{setting.label}</strong>
                    <small>{setting.detail}</small>
                  </div>
                  <div className="settings-control">
                    <Slider
                      value={[thresholds[setting.id] ?? setting.value]}
                      min={0}
                      max={setting.unit === "mm" ? 120 : 100}
                      step={1}
                      onValueChange={(values) =>
                        setThresholds((current) => ({
                          ...current,
                          [setting.id]: values[0] ?? setting.value,
                        }))
                      }
                    />
                    <b>
                      {thresholds[setting.id] ?? setting.value}
                      {setting.unit}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          </PanelBody>
          <PanelFooter>
            <p className="section-note">
              Limites mais baixos aumentam a sensibilidade e o volume de alertas; limites mais altos
              reduzem falsos positivos ao custo de detecção mais tardia.
            </p>
          </PanelFooter>
        </Panel>

        <div className="side-stack">
          <Panel>
            <PanelHeader title="Canais de alerta" icon={BellRing} />
            <PanelBody>
              <div className="settings-list">
                {alertChannels.map((channel) => (
                  <div className="settings-row is-inline" key={channel.id}>
                    <div className="settings-copy">
                      <strong>{channel.label}</strong>
                      <small>{channel.detail}</small>
                    </div>
                    <Switch
                      checked={channels[channel.id] ?? channel.enabled}
                      onCheckedChange={(value) =>
                        setChannels((current) => ({ ...current, [channel.id]: value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Perfil do operador" icon={UserCog} />
            <PanelBody>
              <MetricGrid columns={2}>
                <Metric label="Usuário" value={city.operator.name} />
                <Metric label="Perfil" value={city.operator.role} />
                <Metric label="Unidade" value={city.operator.unit} />
                <Metric label="Fuso" value="America/Sao_Paulo" />
              </MetricGrid>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Panel flush>
        <PanelHeader title="Integrações" icon={Plug} hint="fontes de dados conectadas" />
        <table className="data-table is-wide">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Status</th>
              <th className="is-numeric">Latência</th>
              <th>Saúde</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((integration) => (
              <tr key={integration.id}>
                <td>
                  <strong>{integration.name}</strong>
                </td>
                <td>{integration.status}</td>
                <td className="is-numeric">{integration.latency}</td>
                <td>
                  <StatusBadge level={integration.level}>
                    {integration.level === "normal"
                      ? "Estável"
                      : integration.level === "attention"
                        ? "Atraso"
                        : "Pendente"}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
