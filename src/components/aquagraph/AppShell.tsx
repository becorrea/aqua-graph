import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Droplets,
  MapPin,
  PanelLeft,
  Play,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { city } from "@/data/city";
import { defaultPageMeta, navSections, pageMeta, settingsNavItem } from "@/data/navigation";
import { useSimulatedClock } from "@/hooks/useSimulatedClock";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DemoProvider, useDemo } from "./DemoMode";
import { StatusBadge } from "./primitives";

const NOTIFICATIONS = [
  {
    id: "N-01",
    title: "Setor 14-B — possível vazamento",
    detail: "Probabilidade subiu para 87% nas últimas 2 horas",
    level: "critical" as const,
    age: "Há 8 min",
  },
  {
    id: "N-02",
    title: "Chuva intensa prevista",
    detail: "74 mm acumulados projetados para as próximas 3 horas",
    level: "high" as const,
    age: "Há 21 min",
  },
  {
    id: "N-03",
    title: "Reservatório Norte em queda",
    detail: "Horizonte de abastecimento reduzido para 38 dias",
    level: "attention" as const,
    age: "Há 1h",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={220}>
      <DemoProvider>
        <ShellLayout>{children}</ShellLayout>
      </DemoProvider>
    </TooltipProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const meta = pageMeta[pathname] ?? defaultPageMeta;
  const PageIcon = meta.icon;
  const clock = useSimulatedClock(city.timeLabel);
  const demo = useDemo();

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
          <NavLink
            {...settingsNavItem}
            active={pathname === settingsNavItem.to}
            collapsed={collapsed}
          />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="system-chip">
                  <i />
                  {city.systemStatus}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Telemetria, modelos e integrações respondendo dentro do esperado
              </TooltipContent>
            </Tooltip>

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
                <strong>
                  {city.name} — {city.state}
                </strong>
                <small>
                  {city.weekdayLabel}, {city.dateLabel} · {clock}
                </small>
              </span>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="topbar-bell" aria-label="Notificações">
                  <Bell />
                  <b>{NOTIFICATIONS.length}</b>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="notification-panel">
                <header>
                  <strong>Notificações</strong>
                  <span>{NOTIFICATIONS.length} novas</span>
                </header>
                <ul>
                  {NOTIFICATIONS.map((item) => (
                    <li key={item.id} className={`level-${item.level}`}>
                      <TriangleAlert />
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                        <i>{item.age}</i>
                      </div>
                      <StatusBadge level={item.level} subtle />
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            <div className="topbar-user">
              <span className="user-avatar">{city.operator.initials}</span>
              <span className="user-text">
                <strong>{city.operator.name}</strong>
                <small>{city.operator.role}</small>
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
  active,
  collapsed,
}: {
  label: string;
  to: string;
  icon: typeof Droplets;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link to={to} className={cn("nav-item", active && "is-active")}>
      <Icon />
      <span>{label}</span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
