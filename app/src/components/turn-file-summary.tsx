import { cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { ChevronDownIcon, Lightbulb, Play, ScrollText } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useOpenAgentFile } from "../hooks/use-open-agent-file";
import { useTeams } from "../hooks/use-teams";
import { fileNameOf } from "../lib/agent-file-paths";
import { canOpenAgentSettings } from "../lib/agent-nav";
import { openAgentSettings } from "../lib/open-agent";
import { teamOfAgent } from "../lib/teams-model";
import {
  groupTurnSummaryItems,
  type SemanticUpdateKind,
  type TurnSummaryItem,
} from "../lib/turn-summary-items";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { targetToSection } from "./agent-settings/agent-settings-nav.ts";
import { getFileIcon } from "./file-card";

interface TurnFileSummaryProps {
  items: TurnSummaryItem[];
  agentPath: string;
}

export function TurnFileSummary({ items, agentPath }: TurnFileSummaryProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const [openUpdates, setOpenUpdates] = useState(false);
  const [openFiles, setOpenFiles] = useState(false);

  const { openFile: handleOpen } = useOpenAgentFile(agentPath);

  // Whether a semantic update ("the agent updated its job description") is a
  // LINK at all. Its destination is the canonical agent settings page, whose
  // ONE door is Team Settings, so the gate is "can this caller reach that page
  // for THIS agent". Reaching it without managing the agent is honest, not a
  // dead link: the page renders its read-only face there (`AgentDetail`'s
  // documented rule). A row that only closed the panel is the dead affordance
  // this prevents. The agent's TEAM is passed because that door is PER TEAM:
  // on a server-teams host an explicit team owner configures their team's
  // agents without being an org admin, and only the per-team gate knows it —
  // asking the org-wide question alone would strip the link from those owners.
  const agent = useAgentStore((s) =>
    s.agents.find((a) => a.folderPath === agentPath),
  );
  const teams = useTeams();
  const semanticIsLink =
    !!agent &&
    canOpenAgentSettings(capabilities, agent, teamOfAgent(teams, agent.id));

  const agentId = agent?.id;
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const handleOpenSemantic = useCallback(
    (kind: SemanticUpdateKind) => {
      if (!agent || !agentId) return;
      // Semantic updates land on the agent settings page: Skills on its Skills
      // section, instructions and learnings on the matching Context one.
      setCurrentAgent(agent);
      openAgentSettings(
        agentId,
        kind === "skills" ? "skills" : targetToSection(kind),
      );
      useUIStore.getState().closeMissionPanel();
    },
    [agent, agentId, setCurrentAgent],
  );

  if (items.length === 0) return null;
  const groups = groupTurnSummaryItems(items);

  return (
    <div className="mt-3 flex flex-col gap-2">
      {groups.updates.length > 0 && (
        <SummarySection
          title={t("summary.updatesMade")}
          items={groups.updates}
          open={openUpdates}
          onOpenChange={setOpenUpdates}
          onOpenFile={handleOpen}
          onOpenSemantic={semanticIsLink ? handleOpenSemantic : undefined}
          t={t}
        />
      )}
      {groups.files.length > 0 && (
        <SummarySection
          title={t("summary.newFiles", { count: groups.files.length })}
          items={groups.files}
          open={openFiles}
          onOpenChange={setOpenFiles}
          onOpenFile={handleOpen}
          onOpenSemantic={semanticIsLink ? handleOpenSemantic : undefined}
          t={t}
        />
      )}
    </div>
  );
}

function SummarySection({
  title,
  items,
  open,
  onOpenChange,
  onOpenFile,
  onOpenSemantic,
  t,
}: {
  title: string;
  items: TurnSummaryItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFile: (path: string) => void;
  /** Omitted when the agent's settings page is out of this caller's reach:
   *  semantic rows then render as plain lines instead of dead buttons. */
  onOpenSemantic?: (kind: SemanticUpdateKind) => void;
  t: TFunction<"chat">;
}) {
  return (
    <div className="rounded-lg border border-line/50 bg-chip overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <span>{title}</span>
      </button>
      {open && (
        <div className="border-t border-line/50 divide-y divide-line/50">
          {items.map((item) => {
            const key = item.kind === "file" ? item.path : item.update;
            const Icon = itemIcon(item);
            const open =
              item.kind === "file"
                ? () => onOpenFile(item.path)
                : onOpenSemantic
                  ? () => onOpenSemantic(item.update)
                  : null;
            const body = (
              <>
                <Icon className="h-4 w-4 text-ink-muted shrink-0" />
                <span className="truncate">{itemLabel(item, t)}</span>
              </>
            );
            return open ? (
              <button
                key={key}
                type="button"
                onClick={open}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-hover transition-colors"
              >
                {body}
              </button>
            ) : (
              <div
                key={key}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              >
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function semanticIcon(kind: SemanticUpdateKind) {
  if (kind === "instructions") return ScrollText;
  if (kind === "skills") return Play;
  return Lightbulb;
}

function itemIcon(item: TurnSummaryItem) {
  if (item.kind === "semantic") return semanticIcon(item.update);
  const fileName = fileNameOf(item.path);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  return getFileIcon(ext);
}

function itemLabel(item: TurnSummaryItem, t: TFunction<"chat">): string {
  if (item.kind === "semantic") {
    if (item.update === "instructions") return t("summary.instructionsUpdated");
    if (item.update === "skills") return t("summary.skillsUpdated");
    return t("summary.learningsUpdated");
  }
  return fileNameOf(item.path);
}
