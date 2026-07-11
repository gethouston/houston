import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  LoadingState,
  McpHubsSection,
  SigninState,
  UnavailableState,
  useActiveIntegration,
  useIntegrationsGate,
} from "../integrations";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { IntegrationsPolicy } from "./integrations-policy";
import { IntegrationsReady } from "./integrations-ready";
import { integrationsPageMode } from "./integrations-view-model";

/**
 * The top-level Integrations page (sidebar destination). Exactly one identity
 * per mode: in a Teams workspace it is the org POLICY surface (owner/admin only,
 * gated by the nav); everywhere else it is the caller's PERSONAL connected-apps
 * page. Shares the exact gate UX of the per-agent tab (loading / unavailable /
 * signin / ready) via `useIntegrationsGate`; the ready body owns the mode split.
 */
export function IntegrationsView() {
  const { t } = useTranslation("integrations");
  const { capabilities } = useCapabilities();
  const gate = useIntegrationsGate();
  const active = useActiveIntegration();

  return (
    <div className="h-full overflow-auto">
      <PageContainer className="py-10">
        {gate.kind === "ready" ? (
          integrationsPageMode(capabilities) === "policy" ? (
            <IntegrationsPolicy
              reconnectNotice={gate.reconnectNotice}
              dismissReconnect={gate.dismissReconnect}
            />
          ) : (
            <IntegrationsReady
              reconnectNotice={gate.reconnectNotice}
              dismissReconnect={gate.dismissReconnect}
              provider={active.providerId}
            />
          )
        ) : (
          <>
            <PageHeader
              title={t("home.title")}
              subtitle={t("home.description")}
              className="mb-6"
            />
            {gate.kind === "loading" ? (
              <LoadingState />
            ) : gate.kind === "signin" ? (
              <div className="flex flex-col gap-8">
                <SigninState
                  onSignIn={gate.signIn}
                  signingIn={gate.signingIn}
                />
                <McpHubsSection />
              </div>
            ) : (
              <UnavailableState />
            )}
          </>
        )}
      </PageContainer>
    </div>
  );
}
