import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { AgentSettingsContent } from "../agent-settings-content";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";

/**
 * General drill-in: name, color, share, and delete, reusing
 * {@link AgentSettingsContent}. Always editable here (managers/owners or the
 * single-player sole user), so no read-only gating.
 */
export function AgentAdminGeneral({ agent, onBack }: AgentAdminScreenProps) {
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);
  const setShareAgentId = useUIStore((s) => s.setShareAgentId);

  return (
    <AgentAdminScreenShell onBack={onBack}>
      <AgentSettingsContent
        name={agent.name}
        color={agent.color}
        onRename={(newName) =>
          currentWorkspace
            ? renameAgent(currentWorkspace.id, agent.id, newName)
            : Promise.resolve()
        }
        onChangeColor={(color) =>
          currentWorkspace
            ? updateAgentColor(currentWorkspace.id, agent.id, color)
            : Promise.resolve()
        }
        onShare={() => setShareAgentId(agent.id)}
        onDelete={() =>
          currentWorkspace
            ? deleteAgent(currentWorkspace.id, agent.id)
            : Promise.resolve()
        }
      />
    </AgentAdminScreenShell>
  );
}
