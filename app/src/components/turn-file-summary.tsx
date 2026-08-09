import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useOpenAgentFile } from "../hooks/use-open-agent-file";
import { useTeams } from "../hooks/use-teams";
import { canOpenAgentSettings } from "../lib/agent-nav";
import { genericErrorDescription } from "../lib/error-report";
import { openAgentSettings } from "../lib/open-agent";
import { tauriSystem } from "../lib/tauri";
import { teamOfAgent } from "../lib/teams-model";
import {
  groupTurnSummaryItems,
  type SemanticUpdateKind,
  type TurnSummaryItem,
} from "../lib/turn-summary-items";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { targetToSection } from "./agent-settings/agent-settings-nav.ts";
import { TurnSummarySection } from "./turn-summary-section";
import { useActionBrandResolver } from "./use-action-brand-resolver";

interface TurnFileSummaryProps {
  items: TurnSummaryItem[];
  agentPath: string;
}

export function TurnFileSummary({ items, agentPath }: TurnFileSummaryProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const [openUpdates, setOpenUpdates] = useState(true);
  const [openFiles, setOpenFiles] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const resolveBrand = useActionBrandResolver();
  const { openFile } = useOpenAgentFile(agentPath);
  const agent = useAgentStore((s) =>
    s.agents.find((candidate) => candidate.folderPath === agentPath),
  );
  const teams = useTeams();
  const semanticIsLink =
    !!agent &&
    canOpenAgentSettings(capabilities, agent, teamOfAgent(teams, agent.id));
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);

  const openSemantic = useCallback(
    (kind: SemanticUpdateKind) => {
      if (!agent) return;
      setCurrentAgent(agent);
      openAgentSettings(
        agent.id,
        kind === "skills" ? "skills" : targetToSection(kind),
      );
      useUIStore.getState().closeMissionPanel();
    },
    [agent, setCurrentAgent],
  );

  const openUrl = useCallback(
    (url: string) => {
      tauriSystem.openUrl(url).catch((error) => {
        addToast({
          variant: "error",
          title: t("summary.openLinkFailedTitle"),
          description: genericErrorDescription("open_summary_link", error),
        });
      });
    },
    [addToast, t],
  );

  if (items.length === 0) return null;
  const groups = groupTurnSummaryItems(items);
  const semanticHandler = semanticIsLink ? openSemantic : undefined;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {groups.updates.length > 0 && (
        <TurnSummarySection
          title={t("summary.updatesMade")}
          items={groups.updates}
          open={openUpdates}
          done
          onOpenChange={setOpenUpdates}
          onOpenFile={openFile}
          onOpenSemantic={semanticHandler}
          onOpenUrl={openUrl}
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
          onOpenFile={openFile}
          onOpenSemantic={semanticHandler}
          onOpenUrl={openUrl}
          resolveBrand={resolveBrand}
          t={t}
        />
      )}
    </div>
  );
}
