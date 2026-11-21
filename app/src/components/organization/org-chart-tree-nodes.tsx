import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PersonFace } from "../mission-person-face";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import type { ChartPerson } from "./org-chart-people";
import type { OrgTreeAgent } from "./org-chart-tree";

const CARD =
  "flex h-14 w-full min-w-0 items-center gap-3 rounded-xl bg-card px-3 text-left shadow-card ht-hairline";

const PRESSABLE = cn(
  CARD,
  PRESS_CLASS,
  "hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
);

function Name({ name }: { name: string }) {
  return (
    <span className="min-w-0 flex-1 truncate text-sm leading-tight font-medium text-ink">
      {name}
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

export function TreeCompanyNode({ id, name }: { id: string; name: string }) {
  return (
    <Slot id={id}>
      <div className={CARD}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-background">
          <Building2 className="size-4" />
        </span>
        <Name name={name} />
      </div>
    </Slot>
  );
}

export function TreePersonNode({
  id,
  person,
  onOpen,
}: {
  id: string;
  person: ChartPerson;
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
        <Name name={person.name} />
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
        <Name name={agent.name} />
      </button>
    </Slot>
  );
}

export function TreeMoreNode({ id, label }: { id: string; label: string }) {
  return (
    <Slot id={id}>
      <div
        className={cn(
          CARD,
          "bg-transparent shadow-none ring-1 ring-line-input ring-inset",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm leading-tight font-medium text-ink-muted tabular-nums">
          {label}
        </span>
      </div>
    </Slot>
  );
}
