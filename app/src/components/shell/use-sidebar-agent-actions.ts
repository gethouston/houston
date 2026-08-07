import type { TFunction } from "i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import { showExpectedStateToast } from "../../lib/error-toast";
import { renameAgentWithFollowUp } from "../../lib/rename-agent-follow-up";
import { useAgentStore } from "../../stores/agents";

/** Only `agents:` keys are read here, so that is the whole namespace list. */
type AgentActionsT = TFunction<["agents"]>;

/**
 * The sidebar's agent mutations: rename (validated before the PATCH), colour,
 * delete. Lifted out of the rail component so the rail is layout and wiring
 * only, and so the rename rules have one home rather than being buried in a
 * render function.
 */
export function useSidebarAgentActions(args: {
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
