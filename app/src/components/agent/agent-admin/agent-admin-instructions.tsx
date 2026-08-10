import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { ContextEditorBox } from "../../context/context-editor";

/**
 * Instructions (CLAUDE.md) section, drawn with the ONE standing-prose box
 * (`ContextEditorBox`: always open, saves on blur). No heading of its own —
 * the settings rail row already says "Job description", and no sibling
 * section titles itself either — just the one-line helper over the box
 * (explain ONCE). Read-only for non-managers: the same face, locked, so they
 * still read what the agent is told.
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
    <div>
      <p className="mb-3 text-sm text-ink-muted">{t("instructions.helper")}</p>
      {instructions === undefined ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <ContextEditorBox
          // Compact until this screen's own refactor: its column is page-
          // scrolled with no bounded height, so fill mode has nothing to fill.
          layout={{ rows: 12 }}
          content={instructions}
          readOnly={readOnly}
          onSave={(c) =>
            saveInstructions.mutateAsync({ name: "CLAUDE.md", content: c })
          }
          placeholder={t("instructions.placeholder")}
          ariaLabel={t("subTabs.instructions")}
        />
      )}
    </div>
  );
}
