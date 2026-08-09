import type { TFunction } from "i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../lib/agent-name";
import { isAgentNameConflictError } from "../lib/agent-name-conflict";
import { showExpectedStateToast } from "../lib/error-toast";
import { renameAgentWithFollowUp } from "../lib/rename-agent-follow-up";
import { useAgentStore } from "../stores/agents";

/** Only `agents:` keys are read here, so that is the whole namespace list. */
type AgentActionsT = TFunction<["agents"]>;

/**
 * An agent's mutations: rename (validated before the PATCH), colour, delete.
 *
 * These were the RAIL's, in `shell/use-sidebar-agent-actions.ts`, behind the
 * agent row's "..." menu. That menu is gone — an agent row in the rail is a
 * destination now, not a thing you administer from the sidebar — so the same
 * three handlers moved here, to `hooks/`, and are driven from the one surface
 * that is ABOUT administering agents: a team's Manage agents list.
 *
 * Lifted rather than rewritten on purpose. The rename rules in particular
 * (validate before the PATCH, catch the 409 race, name the conflict in the
 * user's words) are hard-won and must not exist twice.
 */
export function useAgentActions(args: {
  t: AgentActionsT;
  workspaceId: string | undefined;
  /** Every agent in the workspace — the duplicate-name check reads it. */
  agentNamesById: Array<{ id: string; name: string }>;
  /** Repoints the stored layout at an agent's new id after a rename. */
  remapAgentId: (previousId: string, nextId: string) => void;
}) {
  const { t, workspaceId, agentNamesById, remapAgentId } = args;
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);

  const rename = async (agentId: string, newName: string) => {
    if (!workspaceId) return;
    // Validate BEFORE the PATCH (HOU-1166): bad shapes and known duplicates
    // get the expected-state toast without a round-trip. The 409 catch below
    // stays for races (a sibling took the name after this list loaded).
    const issue = agentNameIssue(
      newName,
      agentNamesById.filter((a) => a.id !== agentId).map((a) => a.name),
    );
    if (issue) {
      showExpectedStateToast(
        issue === "taken"
          ? t("agents:toasts.nameConflict", { name: newName.trim() })
          : issue === "tooLong"
            ? t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH })
            : t("agents:nameErrors.invalidChars"),
        t("agents:toasts.nameConflictDescription"),
      );
      return;
    }
    try {
      await renameAgentWithFollowUp({
        workspaceId,
        agentId,
        name: newName,
        renameAgent,
        remapAgentId,
      });
    } catch (err) {
      if (isAgentNameConflictError(err)) {
        showExpectedStateToast(
          t("agents:toasts.nameConflict", { name: newName }),
          t("agents:toasts.nameConflictDescription"),
        );
        return;
      }
      throw err;
    }
  };

  const changeColor = async (agentId: string, color: string) => {
    if (!workspaceId) return;
    await updateAgentColor(workspaceId, agentId, color);
  };

  const remove = async (agentId: string) => {
    if (!workspaceId) return;
    await deleteAgent(workspaceId, agentId);
  };

  return { rename, changeColor, remove };
}
