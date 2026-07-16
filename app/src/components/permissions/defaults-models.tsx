import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useOrgSettings,
  useSetOrgAllowedModels,
} from "../../hooks/queries/use-org-settings";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { ModelsAllowlistEditor } from "../ai-hub/models-allowlist-editor";

/**
 * Permissions > Agents "Defaults for every agent": the org-wide model-allowlist
 * ceiling every agent's effective model choice derives from. The owner edits it;
 * an admin sees it read-only per the role matrix v2. This is a policy ceiling
 * only — the gateway is the sole enforcer, so the editor just persists the org
 * setting. The view gates to multiplayer owner/admin, so it never mounts in
 * single-player or for a plain member.
 */
export function DefaultsModels({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation("teams");
  const readOnly = !isOwner;
  const orgSettings = useOrgSettings(true);
  const setOrgModels = useSetOrgAllowedModels();
  const { catalog } = useHubCatalog();
  const loading = orgSettings.isLoading || !catalog;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
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
            allowModel: (name) => t("models.orgAllowlist.allowModel", { name }),
            readOnlyNote: readOnly
              ? t("models.orgAllowlist.ownerOnly")
              : undefined,
          }}
        />
      )}
      <p className="mt-8 text-center text-xs text-ink-muted">
        {t("models.orgAllowlist.perAgentNote")}
      </p>
    </div>
  );
}
