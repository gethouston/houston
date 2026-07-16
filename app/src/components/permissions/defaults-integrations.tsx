import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import {
  useOrgSettings,
  useSetOrgSettings,
} from "../../hooks/queries/use-org-settings";
import { AllowlistEditor, INTEGRATION_PROVIDER } from "../integrations";

/**
 * Permissions > Agents "Defaults for every agent": the org-wide app-allowlist
 * ceiling every agent's effective allowlist derives from. The owner edits it; an
 * admin sees it read-only per the role matrix v2. This is a policy ceiling only
 * — the gateway is the sole enforcer, so the editor just persists the org
 * setting. Connected accounts seed the picker so already-linked apps surface
 * first. The view gates to multiplayer owner/admin, so it never mounts in
 * single-player or for a plain member.
 */
export function DefaultsIntegrations({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation("teams");
  const readOnly = !isOwner;
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const orgSettings = useOrgSettings(true);
  const setOrgSettings = useSetOrgSettings();
  const loading = orgSettings.isLoading || catalog.isLoading;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <AllowlistEditor
          universe={catalog.data ?? []}
          allowedToolkits={orgSettings.data?.allowedToolkits ?? null}
          seedToolkits={(connections.data ?? []).map((c) => c.toolkit)}
          saving={setOrgSettings.isPending}
          readOnly={readOnly}
          onSave={(next) => setOrgSettings.mutate(next)}
          copy={{
            question: t("integrations.orgAllowlist.question"),
            policyHelper: t("integrations.orgAllowlist.policyHelper"),
            anyLabel: t("integrations.orgAllowlist.anyLabel"),
            anyDesc: t("integrations.orgAllowlist.anyDesc"),
            pickedLabel: t("integrations.orgAllowlist.pickedLabel"),
            pickedDesc: t("integrations.orgAllowlist.pickedDesc"),
            allowedHeading: t("integrations.orgAllowlist.allowedHeading"),
            addHeading: t("integrations.orgAllowlist.addHeading"),
            allowedEmpty: t("integrations.orgAllowlist.allowedEmpty"),
            allowedEmptyCategory: t(
              "integrations.orgAllowlist.allowedEmptyCategory",
            ),
            allowApp: (name) =>
              t("integrations.orgAllowlist.allowApp", { name }),
            readOnlyNote: readOnly
              ? t("integrations.orgAllowlist.ownerOnly")
              : undefined,
          }}
        />
      )}
      <p className="mt-8 text-center text-xs text-ink-muted">
        {t("integrations.orgAllowlist.perAgentNote")}
      </p>
    </div>
  );
}
