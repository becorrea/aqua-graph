import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Ban,
  BellRing,
  BrainCircuit,
  CloudRain,
  Droplets,
  Gauge,
  RadioTower,
  Search,
  TriangleAlert,
  Waves,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./primitives";
import type { ModuleKey, OperationalEvent, Priority, Severity } from "@/types";

const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  perdas: Activity,
  seca: Droplets,
  enchentes: Waves,
  sensing: RadioTower,
  infra: Gauge,
};

const LEVEL_ICON: Record<Severity, LucideIcon> = {
  critical: TriangleAlert,
  high: TriangleAlert,
  attention: Activity,
  info: Gauge,
  normal: Gauge,
};

const ACTION_ICON = {
  inspect: Search,
  pump: Wrench,
  block: Ban,
  alert: BellRing,
  model: BrainCircuit,
  rain: CloudRain,
} as const;

export type ActionIconKey = keyof typeof ACTION_ICON;

export function EventList({
  items,
  onSelect,
  selectedId,
}: {
  items: ReadonlyArray<OperationalEvent>;
  onSelect?: (item: OperationalEvent) => void;
  selectedId?: string | null;
}) {
  return (
    <ul className="event-list">
      {items.map((item) => {
        const Icon = LEVEL_ICON[item.level];
        const interactive = Boolean(onSelect);
        return (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                "event-row",
                `level-${item.level}`,
                selectedId === item.id && "is-selected",
                !interactive && "is-static",
              )}
              onClick={() => onSelect?.(item)}
              disabled={!interactive}
            >
              <span className="event-icon">
                <Icon />
              </span>
              <span className="event-main">
                <strong>
                  {item.place}
                  {item.context && <em>· {item.context}</em>}
                </strong>
                <small>{item.issue}</small>
              </span>
              <span className="event-metric">
                {item.metricHint && <small>{item.metricHint}</small>}
                <b>{item.metric}</b>
                {item.age && <i>{item.age}</i>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export type ActionListItem = {
  id: string;
  action: string;
  rationale?: string;
  impact?: string;
  priority?: Priority;
  level?: Severity;
  module?: ModuleKey;
  icon?: ActionIconKey;
  time?: string;
};

export function ActionList({
  items,
  numbered = true,
  onSelect,
}: {
  items: ReadonlyArray<ActionListItem>;
  numbered?: boolean;
  onSelect?: (item: ActionListItem) => void;
}) {
  return (
    <ol className="action-list">
      {items.map((item, index) => {
        const Icon = item.icon
          ? ACTION_ICON[item.icon]
          : item.module
            ? MODULE_ICON[item.module]
            : Activity;
        return (
          <li key={item.id}>
            <button
              type="button"
              className={cn("action-row", item.level && `level-${item.level}`)}
              onClick={() => onSelect?.(item)}
              disabled={!onSelect}
            >
              <span className={cn("action-index", !numbered && "action-index-icon")}>
                {numbered ? index + 1 : <Icon />}
              </span>
              <span className="action-main">
                <strong>{item.action}</strong>
                {item.rationale && <small>{item.rationale}</small>}
              </span>
              <span className="action-meta">
                {item.priority && (
                  <StatusBadge level={item.level ?? "attention"} subtle>
                    {item.priority}
                  </StatusBadge>
                )}
                {item.impact && <b>{item.impact}</b>}
                {item.time && <i>{item.time}</i>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Lista compacta de evidências, usada nos painéis de explicabilidade. */
export function EvidenceList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="evidence-list">
      {items.map((item) => (
        <li key={item}>
          <i />
          {item}
        </li>
      ))}
    </ul>
  );
}
