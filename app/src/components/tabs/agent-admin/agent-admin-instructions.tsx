import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import { InstructionsContent } from "../job-description-parts";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/** Instructions (CLAUDE.md) section. Always editable (managers/owners only). */
export function AgentAdminInstructions({ agent }: AgentAdminScreenProps) {
  const path = agent.folderPath;
  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);
  return (
    <InstructionsContent
      content={instructions ?? ""}
      onSave={(c) =>
        saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
      }
    />
  );
}
