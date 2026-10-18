import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Droplets,
  FlaskConical,
  MapPin,
  PanelLeft,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLive } from "@/lib/api";
import { defaultPageMeta, navSections, pageMeta } from "@/data/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DemoProvider, useDemo } from "./DemoMode";
import { ScenarioProvider, useScenario } from "./ScenarioContext";
import { StatusBadge } from "./primitives";

const OPERATOR = { initials: "AS", name: "Ana Silva", role: "Operadora · CCO" };

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={220}>
      <ScenarioProvider>
        <DemoProvider>
          <ShellLayout>{children}</ShellLayout>
        </DemoProvider>
      </ScenarioProvider>
    </TooltipProvider>
  );
}

/** Relógio local (America/Sao_Paulo). Só aparece depois da hidratação. */
function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return null;
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const date = now.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
  return { time, date: date.replace(".", "").replace(/^\w/, (c) => c.toUpperCase()) };
}

function ShellLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const meta = pageMeta[pathname] ?? defaultPageMeta;
  const PageIcon = meta.icon;
  const clock = useClock();
  const demo = useDemo();
  const scenario = useScenario();
  const live = useLive(scenario.rainMode, scenario.installed);
  const snapshot = live.data;
  const notifications = snapshot?.notifications ?? [];
  const critical = snapshot?.pipeline.criticalRisks ?? 0;

  return (
    <div className={cn("app-shell", collapsed && "is-collapsed")}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">
            <Droplets />
          </span>
          <span className="brand-text">
            <strong>
              Aqua<em>Graph</em>
            </strong>
            <small>Sistema Nervoso Digital da Água Urbana</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {navSections.map((section, sectionIndex) => (
            <div className="nav-section" key={section.group ?? `section-${sectionIndex}`}>
              {section.group && <span className="nav-group">{section.group}</span>}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  {...item}
                  active={pathname === item.to}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-source">
            <span>Mapa: OpenStreetMap</span>
            <span>Clima: Open-Meteo</span>
            <span>Sensores: simulados</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div className="topbar-page">
            <button
              type="button"
              className="topbar-menu"
              onClick={() => setCollapsed((value) => !value)}
              aria-label="Alternar menu"
            >
              <PanelLeft />
            </button>
            <span className="topbar-page-icon">
              <PageIcon />
            </span>
            <span className="topbar-page-text">
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </span>
          </div>

          <div className="topbar-meta">
            {scenario.simulated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="system-chip is-simulated"
                    onClick={scenario.reset}
                  >
                    <FlaskConical />
                    Simulação ativa
                    <RotateCcw />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {[
                    scenario.rainMode === "extreme" ? "tempestade extrema simulada" : null,
                    scenario.installed > 0
                      ? `${scenario.installed} sensor(es) novo(s) simulado(s)`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  . Clique para voltar à situação real.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn("system-chip", critical > 0 && "has-alert")}>
                    <i />
                    {critical > 0
                      ? `${critical} alerta${critical > 1 ? "s" : ""} crítico${critical > 1 ? "s" : ""}`
                      : "Operação normal"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {snapshot
                    ? `${snapshot.pipeline.online} de ${snapshot.pipeline.sensors} sensores comunicando · ${snapshot.pipeline.risks} riscos monitorados`
                    : "Conectando ao motor de simulação…"}
                </TooltipContent>
              </Tooltip>
            )}

            <Button
              variant="outline"
              size="sm"
              className="demo-trigger"
              onClick={demo.active ? demo.stop : demo.start}
            >
              <Play />
              {demo.active ? "Encerrar Demo" : "Iniciar Demo"}
            </Button>

            <div className="topbar-location">
              <MapPin />
              <span>
                <strong>Ribeirão Preto — SP</strong>
                <small>{clock ? `${clock.date} · ${clock.time}` : "—"}</small>
              </span>
            </div>

            {snapshot && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="topbar-weather">
                    <CloudSun />
                    <span>
                      <strong>
                        {snapshot.weather.temperature.toLocaleString("pt-BR", {
                          maximumFractionDigits: 0,
                        })}
                        °C
                      </strong>
                      <small>{snapshot.weather.description}</small>
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {snapshot.weather.source === "open-meteo"
                    ? `Condição real agora em Ribeirão Preto (Open-Meteo) · umidade ${snapshot.weather.humidity}%`
                    : "Previsão indisponível no momento: usando a climatologia da cidade"}
                </TooltipContent>
              </Tooltip>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="topbar-bell" aria-label="Notificações">
                  <Bell />
                  {notifications.length > 0 && <b>{notifications.length}</b>}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="notification-panel">
                <header>
                  <strong>Notificações</strong>
                  <span>{notifications.length} relevantes</span>
                </header>
                {notifications.length === 0 ? (
                  <p className="empty-hint">Nenhum alerta alto ou crítico agora.</p>
                ) : (
                  <ul>
                    {notifications.map((item) => (
                      <li key={item.id} className={`level-${item.level}`}>
                        <TriangleAlert />
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                          <i>{item.time}</i>
                        </div>
                        <StatusBadge level={item.level} subtle />
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>

            <div className="topbar-user">
              <span className="user-avatar">{OPERATOR.initials}</span>
              <span className="user-text">
                <strong>{OPERATOR.name}</strong>
                <small>{OPERATOR.role}</small>
              </span>
            </div>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  label,
  to,
  icon: Icon,
  hint,
  active,
  collapsed,
}: {
  label: string;
  to: string;
  icon: typeof Droplets;
  hint: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={to} className={cn("nav-item", active && "is-active")}>
          <Icon />
          <span>{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{collapsed ? `${label} — ${hint}` : hint}</TooltipContent>
    </Tooltip>
  );
}
