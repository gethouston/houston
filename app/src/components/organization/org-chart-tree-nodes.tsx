import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PersonFace } from "../mission-person-face";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import type { ChartPerson } from "./org-chart-people";
import type { OrgTreeAgent } from "./org-chart-tree";

/**
 * The org chart's nodes: compact cards, avatar then name over a muted role,
 * the same size at every level so the chart reads as one grid. People and AI
 * Employees are buttons (People on that person, the AI Employee's board)
 * that press in a little; the hover fill is an extra, never the only sign.
 * `id` is the node's `data-tree-node`, which the connectors measure.
 */

const CARD =
  "flex h-14 w-full min-w-0 items-center gap-3 rounded-xl bg-card px-3 text-left shadow-card ht-hairline";

const PRESSABLE = cn(
  CARD,
  PRESS_CLASS,
  "hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
);

function Labels({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm leading-tight font-medium text-ink">
        {name}
      </span>
      {sub && (
        <span className="truncate text-xs leading-tight text-ink-muted tabular-nums">
          {sub}
        </span>
      )}
    </span>
  );
}

function Slot({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div data-tree-node={id} data-reveal="" className="relative w-full">
      {children}
    </div>
  );
}

export function TreeCompanyNode({
  id,
  name,
  sub,
}: {
  id: string;
  name: string;
  sub: string;
}) {
  return (
    <Slot id={id}>
      <div className={CARD}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-background">
          <Building2 className="size-4" />
        </span>
        <Labels name={name} sub={sub} />
      </div>
    </Slot>
  );
}

export function TreePersonNode({
  id,
  person,
  sub,
  onOpen,
}: {
  id: string;
  person: ChartPerson;
  sub: string;
  onOpen: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <Slot id={id}>
      <button
        type="button"
        onClick={() => onOpen(person.userId)}
        aria-label={t("orgChart.openPerson", { name: person.name })}
        className={PRESSABLE}
        style={PRESS_STYLE}
      >
        <PersonFace
          person={{
            id: person.userId,
            label: person.name,
            imageUrl: person.imageUrl,
          }}
          className="size-8 shrink-0"
          initialsClassName="text-xs"
        />
        <Labels name={person.name} sub={sub} />
      </button>
    </Slot>
  );
}

export function TreeAgentNode({
  id,
  agent,
  onOpen,
}: {
  id: string;
  agent: OrgTreeAgent;
  onOpen: (agentId: string) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <Slot id={id}>
      <button
        type="button"
        onClick={() => onOpen(agent.id)}
        aria-label={t("orgChart.openBoardFor", { name: agent.name })}
        className={PRESSABLE}
        style={PRESS_STYLE}
      >
        <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={32} />
        <Labels name={agent.name} sub={agent.role} />
      </button>
    </Slot>
  );
}

/** What the caps left out: a quiet card with the count and what it holds. */
export function TreeMoreNode({
  id,
  count,
  label,
  sub,
}: {
  id: string;
  count: number;
  label: string;
  sub?: string;
}) {
  const { t } = useTranslation("teams");
  return (
    <Slot id={id}>
      <div
        className={cn(
          CARD,
          "bg-transparent shadow-none ring-1 ring-line-input ring-inset",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-medium text-chip-text tabular-nums">
          {t("orgChart.more", { count })}
        </span>
        <Labels name={label} sub={sub} />
      </div>
    </Slot>
  );
}
