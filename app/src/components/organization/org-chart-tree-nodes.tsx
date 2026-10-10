import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonFace } from "../mission-person-face";
import type { ChartPerson } from "./org-chart-people";
import type { OrgTreeAgent } from "./org-chart-tree";

/**
 * The nodes of the on-screen org chart. Each person and AI Employee is a
 * button (a person opens People on them, an AI Employee opens its board);
 * the row's padding is cancelled by its margin so the disc stays on the
 * connector's axis while the hover fill reaches past it.
 */

const ROW =
  "-mx-1.5 -my-1 flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors duration-200 hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none";

function Labels({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm leading-tight font-medium text-ink">
        {name}
      </span>
      {sub && (
        <span className="truncate text-xs leading-tight text-ink-muted">
          {sub}
        </span>
      )}
    </span>
  );
}

/** The top of the tree: the space, with its counts. */
export function TreeCompanyNode({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink">
        <Building2 className="size-5" />
      </span>
      <Labels name={name} sub={sub} />
    </div>
  );
}

export function TreePersonNode({
  person,
  size,
  sub,
  onOpen,
}: {
  person: ChartPerson;
  /** `root` is the personal space's person, at the top of the tree. */
  size: "root" | "branch";
  sub: string;
  onOpen: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <button
      type="button"
      onClick={() => onOpen(person.userId)}
      aria-label={t("orgChart.openPerson", { name: person.name })}
      className={ROW}
    >
      <PersonFace
        person={{
          id: person.userId,
          label: person.name,
          imageUrl: person.imageUrl,
        }}
        className={cn("shrink-0", size === "root" ? "size-10" : "size-9")}
        initialsClassName="text-xs"
      />
      <Labels name={person.name} sub={sub} />
    </button>
  );
}

export function TreeAgentNode({
  agent,
  size,
  onOpen,
}: {
  agent: OrgTreeAgent;
  /** `branch` sits on the people row (a personal space's AI Employees). */
  size: "branch" | "leaf";
  onOpen: (agentId: string) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <button
      type="button"
      onClick={() => onOpen(agent.id)}
      aria-label={t("orgChart.openBoardFor", { name: agent.name })}
      className={ROW}
    >
      <HoustonAvatar
        color={resolveAgentColor(agent.color)}
        diameter={size === "branch" ? 36 : 32}
      />
      <Labels name={agent.name} sub={agent.role} />
    </button>
  );
}

/** "+N" for what the caps left out, sized like the nodes beside it. */
export function TreeMoreNode({
  count,
  label,
  sub,
  size,
}: {
  count: number;
  label: string;
  /** What the left-out people bring, e.g. "9 AI Employees". */
  sub?: string;
  size: "branch" | "leaf";
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-chip text-xs font-medium text-chip-text tabular-nums",
          size === "branch" ? "size-9" : "size-8",
        )}
      >
        {t("orgChart.more", { count })}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-ink-muted">{label}</span>
        {sub && <span className="truncate text-xs text-ink-muted">{sub}</span>}
      </span>
    </div>
  );
}
