import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { AllowlistEditor } from "../../integrations/allowlist-editor";

interface AgentAllowlistSectionProps {
  /** The agent-level ceiling: `null` = all allowed, else the explicit set. */
  allowedToolkits: string[] | null;
  /** Catalog for resolving slugs to real app names — the full selectable universe. */
  catalog: IntegrationToolkit[];
  /** This user's connected toolkits — the seed when first restricting. */
  connectedToolkits: string[];
  /** A write is in flight (disables the toggles). */
  saving: boolean;
  /** View-only viewer (a non-manager): controls disabled, "Add apps" hidden. */
  readOnly?: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's integration allowlist ceiling
 * (Teams v2), rendered flush in the Access section's right pane (no card
 * wrapper). A thin wrapper over the shared {@link AllowlistEditor}: the whole
 * catalog is the selectable universe (policy is per agent only — there is no
 * org-wide ceiling to narrow it) and it supplies the `teams` i18n copy; all
 * behavior lives in the editor.
 */
export function AgentAllowlistSection({
  allowedToolkits,
  catalog,
  connectedToolkits,
  saving,
  readOnly = false,
  onSave,
}: AgentAllowlistSectionProps) {
  const { t } = useTranslation("teams");

  return (
    <AllowlistEditor
      universe={catalog}
      allowedToolkits={allowedToolkits}
      seedToolkits={connectedToolkits}
      saving={saving}
      readOnly={readOnly}
      onSave={onSave}
      copy={{
        question: t("integrations.allowlist.question"),
        policyHelper: t("integrations.allowlist.policyHelper"),
        readOnlyNote: t("integrations.allowlist.readOnlyNote"),
        anyLabel: t("integrations.allowlist.anyLabel"),
        anyDesc: t("integrations.allowlist.anyDesc"),
        pickedLabel: t("integrations.allowlist.pickedLabel"),
        pickedDesc: t("integrations.allowlist.pickedDesc"),
        allowedHeading: t("integrations.allowlist.allowedHeading"),
        addHeading: t("integrations.allowlist.addHeading"),
        allowedEmpty: t("integrations.allowlist.allowedEmpty"),
        allowedEmptyCategory: t("integrations.allowlist.allowedEmptyCategory"),
        allowApp: (name) => t("integrations.allowlist.allowApp", { name }),
      }}
    />
  );
}
