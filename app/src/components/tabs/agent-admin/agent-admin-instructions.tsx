import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { InstructionsContent } from "../job-description-parts";

/** Instructions (CLAUDE.md) section. Read-only for non-managers. */
export function AgentAdminInstructions({
  agent,
  readOnly = false,
}: AgentSectionProps) {
  const path = agent.folderPath;
  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);
  return (
    <InstructionsContent
      content={instructions ?? ""}
      readOnly={readOnly}
      onSave={(c) =>
        saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
      }
    />
  );
}
