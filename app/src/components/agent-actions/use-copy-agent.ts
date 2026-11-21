import type { PortableExportSelection } from "@houston/engine-adapter";
import { isAgentNameTaken } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import { isAgentWarmingError } from "../../lib/agent-warming-guard";
import { toAgent } from "../../lib/agents-facade";
import { analytics } from "../../lib/analytics";
import { chatCopyComplete, copyAgentChats } from "../../lib/copy-agent-chats";
import { getEngine } from "../../lib/engine";
import { isEngineWakingError } from "../../lib/engine-waking-error";
import { genericErrorDescription } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { logger } from "../../lib/logger";
import { openAgentBoard } from "../../lib/open-agent";
import { tauriConfig } from "../../lib/tauri";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";
import { fullPortableSelection } from "./copy-agent-model";

export function useCopyAgent(): (args: {
  agent: Agent;
  name: string;
  team: TeamView | null;
  color?: string;
  selection?: PortableExportSelection;
  copyChats?: boolean;
  via?: "settings" | "create_dialog";
}) => Promise<boolean> {
  const { t } = useTranslation("agents");
  const addToast = useUIStore((s) => s.addToast);
  const adoptAgent = useAgentStore((s) => s.adopt);
  const workspaceName = useWorkspaceStore((s) => s.current?.name);
  const moveAgent = useMoveAgentTeam();

  return async ({
    agent,
    name,
    team,
    color,
    selection,
    copyChats = false,
    via = "settings",
  }) => {
    try {
      const engine = getEngine();
      const packaged =
        selection ??
        fullPortableSelection(await engine.portablePreview(agent.folderPath));
      const bytes = await engine.portablePackage(agent.folderPath, {
        selection: packaged,
        meta: {
          agentId: agent.configId ?? agent.id,
          agentName: agent.name,
          anonymized: false,
        },
      });
      const uploaded = await engine.importPreview(bytes);
      const source = await tauriConfig.read(agent.folderPath);
      const installed = await engine.importInstall({
        packageId: uploaded.packageId,
        workspaceName: workspaceName ?? "",
        agentName: name.trim(),
        agentColor: color ?? agent.color,
        selection: fullPortableSelection(uploaded.preview),
        config: { provider: source.provider, model: source.model },
      });
      adoptAgent(toAgent(installed.agent));
      if (team) moveAgent(installed.agent.id, team);
      analytics.track("agent_copied", { agent_slug: agent.id, source: via });
      addToast({
        variant: "success",
        title: t("copyAgent.toasts.createdTitle"),
        description: t("copyAgent.toasts.createdDescription", {
          name: installed.agentName,
        }),
      });
      openAgentBoard(installed.agent.id);
      if (copyChats) {
        void (async () => {
          try {
            const outcome = await copyAgentChats(
              engine,
              agent.folderPath,
              installed.agentPath,
              undefined,
              (err) => isEngineWakingError(err) || isAgentWarmingError(err),
              installed.routineIds,
            );
            if (!chatCopyComplete(outcome)) {
              logger.error(
                `[copy-agent] chats partial: board=${outcome.boardWritten} rejected=${JSON.stringify(outcome.rejected)}`,
              );
              addToast({
                variant: "error",
                title: t("copyAgent.errors.chatsFailed"),
                description: t("copyAgent.errors.chatsPartial"),
              });
              return;
            }
            addToast({
              variant: "success",
              title: t("copyAgent.toasts.chatsCopiedTitle"),
              description: t("copyAgent.toasts.chatsCopiedDescription", {
                count: outcome.conversations,
                name: installed.agentName,
              }),
            });
          } catch (err) {
            addToast({
              variant: "error",
              title: t("copyAgent.errors.chatsFailed"),
              description: genericErrorDescription("agent_copy_chats", err),
            });
          }
        })();
      }
      return true;
    } catch (err) {
      if (isAgentNameTaken(err)) {
        showExpectedStateToast(
          t("toasts.nameConflict", { name: name.trim() }),
          t("toasts.nameConflictDescription"),
        );
        return false;
      }
      addToast({
        variant: "error",
        title: t("copyAgent.errors.failed"),
        description: genericErrorDescription("agent_copy", err),
      });
      return false;
    }
  };
}
