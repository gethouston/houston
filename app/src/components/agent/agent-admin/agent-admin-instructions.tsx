import { useTranslation } from "react-i18next";
import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { ContextEditorPage } from "../../context/context-editor";

/**
 * Instructions (CLAUDE.md) section, in the ONE standing-prose grammar
 * (`ContextEditorPage`): a level-2 hero — the settings page's rail already
 * owns the screen's title — over the always-open box. Read-only for
 * non-managers: the same face, locked, so they still read what the agent is
 * told.
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
