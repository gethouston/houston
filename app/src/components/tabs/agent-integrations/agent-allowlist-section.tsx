import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AllowlistEditor } from "../../integrations/allowlist-editor";

interface AgentAllowlistSectionProps {
  /** The agent-level ceiling: `null` = all allowed, else the explicit set. */
  allowedToolkits: string[] | null;
  /** The org-wide ceiling the agent set may only narrow (`null` = all). */
  orgAllowedToolkits: string[] | null;
  /** Catalog for resolving slugs to real app names. */
  catalog: IntegrationToolkit[];
  /** This user's connected toolkits — the seed when first restricting. */
  connectedToolkits: string[];
  /** A write is in flight (disables the toggles). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's integration allowlist ceiling
 * (Teams v2), rendered flush in the Access section's right pane (no card
 * wrapper). A thin wrapper over the shared {@link AllowlistEditor}: it computes
 * the selectable universe from the org ceiling (a manager can only allow apps
 * the org itself allows) and supplies the `teams` i18n copy; all behavior lives
 * in the editor. The narrowing is surfaced, not silent: a quiet footnote counts
 * the apps the workspace hides so a manager knows why the catalog looks shorter.
 */
export function AgentAllowlistSection({
  allowedToolkits,
  orgAllowedToolkits,
  catalog,
  connectedToolkits,
  saving,
  onSave,
}: AgentAllowlistSectionProps) {
  const { t } = useTranslation("teams");

  // The selectable universe: the org ceiling if one is set, else the whole
  // catalog. A manager can only allow apps the org itself allows.
  const universe = useMemo(() => {
    if (orgAllowedToolkits === null) return catalog;
    const org = new Set(orgAllowedToolkits);
    return catalog.filter((tk) => org.has(tk.slug));
  }, [catalog, orgAllowedToolkits]);

  // Apps the workspace ceiling removes from an otherwise full catalog (the
  // catalog is one row per toolkit, so a plain length delta is a distinct
  // count). A `null` org ceiling hides nothing. Surfaced below when positive.
  const workspaceHidden = catalog.length - universe.length;

  return (
    <>
      <AllowlistEditor
        universe={universe}
        allowedToolkits={allowedToolkits}
        seedToolkits={connectedToolkits}
        saving={saving}
        readOnly={false}
        onSave={onSave}
        copy={{
          question: t("integrations.allowlist.question"),
          policyHelper: t("integrations.allowlist.policyHelper"),
          anyLabel: t("integrations.allowlist.anyLabel"),
          anyDesc: t("integrations.allowlist.anyDesc"),
          pickedLabel: t("integrations.allowlist.pickedLabel"),
          pickedDesc: t("integrations.allowlist.pickedDesc"),
          allowedHeading: t("integrations.allowlist.allowedHeading"),
          addHeading: t("integrations.allowlist.addHeading"),
          allowedEmpty: t("integrations.allowlist.allowedEmpty"),
          allowedEmptyCategory: t(
            "integrations.allowlist.allowedEmptyCategory",
          ),
          allowApp: (name) => t("integrations.allowlist.allowApp", { name }),
        }}
      />
      {workspaceHidden > 0 && (
        <p className="mt-4 text-xs text-ink-muted">
          {t("integrations.orgAllowlist.workspaceOff", {
            count: workspaceHidden,
          })}
        </p>
      )}
    </>
  );
}
