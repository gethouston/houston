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
import { useCapabilities } from "../../hooks/use-capabilities";
import { canEditOrgSettings } from "../../lib/org-roles";
import { useUIStore } from "../../stores/ui";
import {
  AllowlistEditor,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";

interface IntegrationsPolicyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The policy identity of the global Integrations page (Teams owner/admin): the
 * org-wide app allowlist ceiling every agent's effective allowlist derives from.
 * No connected-apps grid and no connect catalog live here (accounts live in
 * Settings; connecting happens there or on an agent tab) — the page is policy
 * first. Owner edits the ceiling; an admin sees it read-only. A quiet footer
 * points at Settings > Connected accounts for managing the caller's own apps.
 */
export function IntegrationsPolicy({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsPolicyProps) {
  const { t } = useTranslation("integrations");
  const { t: tTeams } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);

  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const orgSettings = useOrgSettings(true);
  const setOrgSettings = useSetOrgSettings();

  const readOnly = !canEditOrgSettings(capabilities);
  const loading = orgSettings.isLoading || catalog.isLoading;

  const openConnectedAccounts = () => {
    setSettingsSection("connectedAccounts");
    setViewMode("settings");
  };

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("policyPage.subtitle")}
        className="mb-6"
      />

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

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
            question: tTeams("integrations.orgAllowlist.question"),
            policyHelper: tTeams("integrations.orgAllowlist.policyHelper"),
            anyLabel: tTeams("integrations.orgAllowlist.anyLabel"),
            anyDesc: tTeams("integrations.orgAllowlist.anyDesc"),
            pickedLabel: tTeams("integrations.orgAllowlist.pickedLabel"),
            pickedDesc: tTeams("integrations.orgAllowlist.pickedDesc"),
            allowedHeading: tTeams("integrations.orgAllowlist.allowedHeading"),
            addHeading: tTeams("integrations.orgAllowlist.addHeading"),
            allowedEmpty: tTeams("integrations.orgAllowlist.allowedEmpty"),
            allowedEmptyCategory: tTeams(
              "integrations.orgAllowlist.allowedEmptyCategory",
            ),
            allowApp: (name) =>
              tTeams("integrations.orgAllowlist.allowApp", { name }),
            readOnlyNote: readOnly
              ? tTeams("integrations.orgAllowlist.ownerOnly")
              : undefined,
          }}
        />
      )}

      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="text-xs text-ink-muted">{t("policyPage.perAgentNote")}</p>
        <button
          type="button"
          onClick={openConnectedAccounts}
          className="text-xs text-ink-muted underline underline-offset-4 decoration-dotted transition-colors hover:text-ink"
        >
          {t("policyPage.manageAccounts")}
        </button>
      </div>
    </>
  );
}
