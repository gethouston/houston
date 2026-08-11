import { useTranslation } from "react-i18next";
import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { ContextEditorPage } from "../../context/context-editor";

/**
 * Instructions (CLAUDE.md) section, drawn as the ONE standing-context PAGE
 * ({@link ContextEditorPage}: hero + pinned document card) — the same surface
 * About me and Admin's Company context wear, so every standing-prose editor in
 * the product is one component. `level={2}`: the drilled header's identity
 * lozenge already carries the screen's `<h1>`. Read-only for non-managers:
 * the same face, locked, so they still read what the agent is told.
 */
export function AgentAdminInstructions({
  agent,
  readOnly = false,
}: AgentSectionProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;
  const { data: instructions } = useInstructions(path);
  const saveInstructions = useSaveInstructions(path);
  return (
    <ContextEditorPage
      level={2}
      title={t("subTabs.instructions")}
      subtitle={t("instructions.helper")}
      ready={instructions !== undefined}
      content={instructions ?? ""}
      readOnly={readOnly}
      onSave={(c) =>
        saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
      }
      placeholder={t("instructions.placeholder")}
    />
  );
}
