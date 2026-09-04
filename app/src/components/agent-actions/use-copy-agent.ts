import type { PortableExportSelection } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import { finishAgentSetup } from "../../lib/agent-setup";
import { analytics } from "../../lib/analytics";
import { copyAgentChats } from "../../lib/copy-agent-chats";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { logger } from "../../lib/logger";
import { openAgentBoard } from "../../lib/open-agent";
import { tauriConfig, toAgent } from "../../lib/tauri";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";
import { fullPortableSelection } from "./copy-agent-model";

/**
 * Duplicate ONE agent inside the workspace, as a create. Every leg is an
 * existing surface, which is what makes this work on BOTH backends: the
 * agent-scoped portable routes package the source's content (the same set
 * "Export a copy" carries — conversations and files are not part of it), the
 * package installs as an ordinary create-with-seeds, and the one move action
 * files the copy in the chosen team.
 *
 * `selection` narrows what the package carries (the create dialog's "Copy an
 * agent" wizard lets the user leave items behind); absent, the copy is
 * faithful. `color` defaults to the source's. `copyChats` moves the source's
 * tasks and conversations over afterwards through the agent-scoped migration
 * routes, in the background: on the hosted profile the copy's pod is still
 * cold-starting, and holding the dialog for that would freeze it.
 *
 * Resolves `true` when the copy exists (the dialog closes on it); failures
 * toast here and resolve `false` so the dialog stays open for a retry.
 */
export function useCopyAgent(): (args: {
  agent: Agent;
  name: string;
  team: TeamView | null;
  color?: string;
  selection?: PortableExportSelection;
  copyChats?: boolean;
  /** Which door the copy came through, for analytics. */
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
      const installed = await engine.importInstall({
        packageId: uploaded.packageId,
        workspaceName: workspaceName ?? "",
        agentName: name.trim(),
        agentColor: color ?? agent.color,
        selection: fullPortableSelection(uploaded.preview),
      });
      // Reveal now (the optimistic create/import contract, HOU-710), and file
      // the copy in its team BEFORE navigating — openAgentBoard resolves its
      // destination from the live teams model.
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
            );
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
      // The model pin dispatches to the copy's engine — on the hosted profile a
      // pod still cold-starting — so it finishes in the background like the
      // other create doors (HOU-649); the wrappers toast their own failures.
      void (async () => {
        try {
          const cfg = await tauriConfig.read(agent.folderPath);
          await finishAgentSetup(installed.agentPath, {
            provider: cfg.provider,
            model: cfg.model,
            routine: null,
          });
        } catch (e) {
          logger.error(`[copy-agent] model pin failed: ${e}`);
        }
      })();
      return true;
    } catch (err) {
      // The 409 race: a sibling took the name after the dialog's live check.
      if (isAgentNameConflictError(err)) {
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
