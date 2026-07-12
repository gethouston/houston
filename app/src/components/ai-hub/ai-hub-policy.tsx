import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useOrgSettings,
  useSetOrgAllowedModels,
} from "../../hooks/queries/use-org-settings";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { canEditOrgSettings } from "../../lib/org-roles";
import { ModelsAllowlistEditor } from "./models-allowlist-editor";

/**
 * The workspace AI-model policy for the global AI Models hub (Teams owner/admin):
 * the org-wide model ceiling every agent's effective allowed-models set is
 * derived under — the model-side twin of the Integrations page's app-allowlist
 * policy. Owner edits the ceiling; an admin sees it read-only with an owner-only
 * note. The picker is sourced from the same AI-hub catalog the per-agent
 * {@link AgentModelsSection} and the model directory use, so the two never drift.
 * A quiet footer explains that managers can narrow this further per agent.
 *
 * Rendered only inside the hub's Teams-gated "policy" tab, which owner/admin
 * alone reach (plain members lose the AI Hub nav, exactly as they lose the
 * Integrations nav — providers are org-level, so a member has no account or
 * policy to act on here).
 */
export function AiHubPolicy() {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;

  const orgSettings = useOrgSettings(teams);
  const setOrgModels = useSetOrgAllowedModels();
  const { catalog } = useHubCatalog();

  const readOnly = !canEditOrgSettings(capabilities);
  const loading = orgSettings.isLoading || !catalog;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <ModelsAllowlistEditor
            models={catalog.models}
            allowedModels={orgSettings.data?.allowedModels ?? null}
            saving={setOrgModels.isPending}
            readOnly={readOnly}
            onSave={(next) => setOrgModels.mutate(next)}
            copy={{
              question: t("models.orgAllowlist.question"),
              policyHelper: t("models.orgAllowlist.policyHelper"),
              anyLabel: t("models.orgAllowlist.anyLabel"),
              anyDesc: t("models.orgAllowlist.anyDesc"),
              pickedLabel: t("models.orgAllowlist.pickedLabel"),
              pickedDesc: t("models.orgAllowlist.pickedDesc"),
              allowedHeading: t("models.orgAllowlist.allowedHeading"),
              addHeading: t("models.orgAllowlist.addHeading"),
              allowedEmpty: t("models.orgAllowlist.allowedEmpty"),
              allowedEmptyLab: t("models.orgAllowlist.allowedEmptyLab"),
              searchModels: t("models.orgAllowlist.searchModels"),
              noModels: t("models.orgAllowlist.noModels"),
              allowModel: (name) =>
                t("models.orgAllowlist.allowModel", { name }),
              readOnlyNote: readOnly
                ? t("models.orgAllowlist.ownerOnly")
                : undefined,
            }}
          />

          <p className="mt-8 text-center text-xs text-ink-muted">
            {t("models.orgAllowlist.perAgentNote")}
          </p>
        </>
      )}
    </div>
  );
}
