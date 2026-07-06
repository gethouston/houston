import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import { InstructionsContent } from "../job-description-parts";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";

/** Instructions (CLAUDE.md) drill-in. Always editable (managers/owners only). */
export function AgentAdminInstructions({
  agent,
  onBack,
}: AgentAdminScreenProps) {
  const path = agent.folderPath;
  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);
  return (
    <AgentAdminScreenShell onBack={onBack}>
      <InstructionsContent
        content={instructions ?? ""}
        onSave={(c) =>
          saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
        }
      />
    </AgentAdminScreenShell>
  );
}
