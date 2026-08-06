import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import { InstructionsContent } from "../job-description-parts";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/** Instructions (CLAUDE.md) section. Read-only for non-managers. */
export function AgentAdminInstructions({
  agent,
  readOnly = false,
}: AgentAdminScreenProps & { readOnly?: boolean }) {
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
