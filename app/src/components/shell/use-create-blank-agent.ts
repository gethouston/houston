import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useKickoffPinResolver } from "../../hooks/use-kickoff-pin-resolver";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import type { AgentRoleContext } from "../../lib/agent-role-context";
import {
  type CreatedEmployee,
  createEmployee,
} from "../../lib/create-employee";
import { openAgentBoard } from "../../lib/open-agent";
import type { AgentDefinition } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import type { CreateFailureKind } from "./create-agent-flow-model";

export interface CreateFailure {
  kind: CreateFailureKind;
  message: string;
}

export function useCreateBlankAgent({
  open,
  selectedDef,
  onError,
  onDone,
}: {
  open: boolean;
  selectedDef: AgentDefinition | undefined;
  /** Why the create did not land, or null when a new attempt starts. */
  onError: (failure: CreateFailure | null) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["agents", "agentOnboarding"]);
  const [creating, setCreating] = useState(false);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const resolveKickoffPin = useKickoffPinResolver(open);

  useEffect(() => {
    if (!open) setCreating(false);
  }, [open]);

  return {
    creating,
    createBlankAgent: async (
      name: string,
      color: string | undefined,
      brief: AgentRoleContext,
    ) => {
      const trimmed = name.trim();
      if (creating || !trimmed || !currentWorkspace) return;
      onError(null);
      setCreating(true);
      let created: CreatedEmployee;
      try {
        created = await createEmployee({
          workspaceId: currentWorkspace.id,
          name: trimmed,
          color,
          brief,
          pin: await resolveKickoffPin(),
          template: {
            installedPath: selectedDef?.path,
            seeds: selectedDef?.config.agentSeeds,
          },
        });
      } catch (err) {
        onError(
          isAgentNameConflictError(err)
            ? {
                kind: "nameConflict",
                message: t("agents:toasts.nameConflict", { name: trimmed }),
              }
            : {
                kind: "failed",
                message: t("agentOnboarding:roleSetup.createFailed"),
              },
        );
        setCreating(false);
        return;
      }
      openAgentBoard(created.id);
      onDone();
    },
  };
}
