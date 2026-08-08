import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useOpenAgentFile } from "../hooks/use-open-agent-file";
import { isAgentManager } from "../lib/agent-access";
import { genericErrorDescription } from "../lib/error-report";
import { tauriSystem } from "../lib/tauri";
import {
  groupTurnSummaryItems,
  type SemanticUpdateKind,
  type TurnSummaryItem,
} from "../lib/turn-summary-items";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { TurnSummarySection } from "./turn-summary-section";
import { useActionBrandResolver } from "./use-action-brand-resolver";

interface TurnFileSummaryProps {
  items: TurnSummaryItem[];
  agentPath: string;
}

export function TurnFileSummary({ items, agentPath }: TurnFileSummaryProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  // "Updates made" starts EXPANDED (PRODUCT-1196): it is the turn's receipt,
  // and a collapsed receipt was read as "nothing happened". New files keep
  // their collapsed default — they are secondary.
  const [openUpdates, setOpenUpdates] = useState(true);
  const [openFiles, setOpenFiles] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const resolveBrand = useActionBrandResolver();

  const { openFile: handleOpen } = useOpenAgentFile(agentPath);

  const handleOpenSemantic = useCallback(
    (kind: SemanticUpdateKind) => {
      const agents = useAgentStore.getState().agents;
      const agent = agents.find((a) => a.folderPath === agentPath);
      const ui = useUIStore.getState();
      // Semantic updates land on manager-editable surfaces: skills on the
      // Skills tab, instructions and learnings on the Context tab's matching
      // section. Non-managers keep their read-only Context view untouched.
      if (agent && isAgentManager(capabilities, agent)) {
        useAgentStore.getState().setCurrent(agent);
        if (kind === "skills") {
          ui.setViewMode("skills");
        } else {
          ui.setContextTarget(kind);
          ui.setViewMode("context");
        }
      }
      ui.closeMissionPanel();
    },
    [agentPath, capabilities],
  );

  const handleOpenUrl = useCallback(
    (url: string) => {
      tauriSystem.openUrl(url).catch((err) => {
        addToast({
          variant: "error",
          title: t("summary.openLinkFailedTitle"),
          description: genericErrorDescription("open_summary_link", err),
        });
      });
    },
    [addToast, t],
  );

  if (items.length === 0) return null;
  const groups = groupTurnSummaryItems(items);

  return (
    <div className="mt-3 flex flex-col gap-2">
      {groups.updates.length > 0 && (
        <TurnSummarySection
          title={t("summary.updatesMade")}
          items={groups.updates}
          open={openUpdates}
          done
          onOpenChange={setOpenUpdates}
          onOpenFile={handleOpen}
          onOpenSemantic={handleOpenSemantic}
          onOpenUrl={handleOpenUrl}
          resolveBrand={resolveBrand}
          t={t}
        />
      )}
      {groups.files.length > 0 && (
        <TurnSummarySection
          title={t("summary.newFiles", { count: groups.files.length })}
          items={groups.files}
          open={openFiles}
          onOpenChange={setOpenFiles}
          onOpenFile={handleOpen}
          onOpenSemantic={handleOpenSemantic}
          onOpenUrl={handleOpenUrl}
          resolveBrand={resolveBrand}
          t={t}
        />
      )}
    </div>
  );
}
