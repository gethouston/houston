import { cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import { ChevronDownIcon, Lightbulb, Play, ScrollText } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { isVisibleAgentTab } from "../agents/standard-tabs";
import { useCapabilities } from "../hooks/use-capabilities";
import { tauriFiles } from "../lib/tauri";
import {
  groupTurnSummaryItems,
  type SemanticUpdateKind,
  type TurnSummaryItem,
} from "../lib/turn-summary-items";
import { useAgentStore } from "../stores/agents";
import type { JobDescriptionTarget } from "../stores/ui";
import { useUIStore } from "../stores/ui";
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

  const handleOpen = useCallback(
    (path: string) => {
      tauriFiles.open(agentPath, path).catch(console.error);
    },
    [agentPath],
  );

  const handleOpenSemantic = useCallback(
    (kind: SemanticUpdateKind) => {
      const agents = useAgentStore.getState().agents;
      const agent = agents.find((a) => a.folderPath === agentPath);
      const ui = useUIStore.getState();
      // Agent Settings (job-description) is hidden from plain org members, so a
      // member's deep-link must not navigate there — it would land on a blank
      // pane (AgentRenderer marks no visible tab active). Only navigate when the
      // caller may actually see the tab; otherwise just close the mission panel.
      if (agent && isVisibleAgentTab(capabilities, agent, "job-description")) {
        useAgentStore.getState().setCurrent(agent);
        ui.setJobDescriptionTarget(semanticTarget(kind));
        ui.setViewMode("job-description");
      }
      ui.setMissionPanelOpen(false);
    },
    [agentPath, capabilities],
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
          onOpenSemantic={handleOpenSemantic}
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
          onOpenSemantic={handleOpenSemantic}
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
  onOpenSemantic: (kind: SemanticUpdateKind) => void;
  t: TFunction<"chat">;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-secondary overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="border-t border-border/50 divide-y divide-border/50">
          {items.map((item) => {
            const key = item.kind === "file" ? item.path : item.update;
            const Icon = itemIcon(item);
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  item.kind === "file"
                    ? onOpenFile(item.path)
                    : onOpenSemantic(item.update)
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{itemLabel(item, t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function semanticTarget(kind: SemanticUpdateKind): JobDescriptionTarget {
  return kind;
}

function semanticIcon(kind: SemanticUpdateKind) {
  if (kind === "instructions") return ScrollText;
  if (kind === "skills") return Play;
  return Lightbulb;
}

/** Last path segment, separator-agnostic. See `turn-summary-items.ts`
 * for why `.split("/")` alone is wrong on Windows. */
function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
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
