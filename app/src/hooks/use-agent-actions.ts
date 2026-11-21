import { isAgentNameReserved, isAgentNameTaken } from "@houston/sdk";
import type { TFunction } from "i18next";
import { useEmployeeNameIssueCopy } from "../components/employee-card/use-employee-name";
import { agentNameIssue } from "../lib/agent-name";
import { isAgentWarmingRefusal } from "../lib/agent-warming-refusal";
import { showExpectedStateToast } from "../lib/error-toast";
import { tellOptimisticRefusal } from "../lib/optimistic-write";
import { renameAgentWithFollowUp } from "../lib/rename-agent-follow-up";
import { useAgentStore } from "../stores/agents";

type AgentActionsT = TFunction<["agents"]>;

export function useAgentActions(args: {
  t: AgentActionsT;
  workspaceId: string | undefined;
  agentNamesById: Array<{ id: string; name: string }>;
  remapAgentId: (previousId: string, nextId: string) => void;
}) {
  const { t, workspaceId, agentNamesById, remapAgentId } = args;
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);
  const issueCopy = useEmployeeNameIssueCopy();
  const nameOf = (agentId: string) =>
    agentNamesById.find((a) => a.id === agentId)?.name ?? "";
  const refused = (
    command: string,
    titleKey:
      | "agents:toasts.renameFailed"
      | "agents:toasts.colorFailed"
      | "agents:toasts.deleteFailed",
    agentId: string,
    err: unknown,
  ): never => {
    if (!isAgentWarmingRefusal(err)) {
      tellOptimisticRefusal(command, err, {
        title: t(titleKey, { name: nameOf(agentId) }),
        description: t("agents:toasts.writeFailedDescription"),
      });
    }
    throw err;
  };

  const rename = async (agentId: string, newName: string) => {
    if (!workspaceId) return;
    const issue = agentNameIssue(
      newName,
      agentNamesById.filter((a) => a.id !== agentId).map((a) => a.name),
      agentNamesById.find((a) => a.id === agentId)?.name,
    );
    if (issue) {
      showExpectedStateToast(
        issueCopy(issue, newName),
        t("agents:toasts.nameConflictDescription"),
      );
      return;
    }
    try {
      return await renameAgentWithFollowUp({
        workspaceId,
        agentId,
        name: newName,
        renameAgent,
        remapAgentId,
      });
    } catch (err) {
      if (isAgentNameTaken(err)) {
        showExpectedStateToast(
          t("agents:toasts.nameConflict", { name: newName }),
          t("agents:toasts.nameConflictDescription"),
        );
        return;
      }
      if (isAgentNameReserved(err)) {
        showExpectedStateToast(
          t("agents:nameErrors.reserved"),
          t("agents:toasts.nameConflictDescription"),
        );
        return;
      }
      return refused(
        "rename_agent",
        "agents:toasts.renameFailed",
        agentId,
        err,
      );
    }
  };

  const changeColor = async (agentId: string, color: string) => {
    if (!workspaceId) return;
    try {
      await updateAgentColor(workspaceId, agentId, color);
    } catch (err) {
      refused("update_agent_color", "agents:toasts.colorFailed", agentId, err);
    }
  };

  const remove = async (agentId: string) => {
    if (!workspaceId) return;
    try {
      await deleteAgent(workspaceId, agentId);
    } catch (err) {
      refused("delete_agent", "agents:toasts.deleteFailed", agentId, err);
    }
  };

  return { rename, changeColor, remove };
}
