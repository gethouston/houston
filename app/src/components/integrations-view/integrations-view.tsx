import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  CustomIntegrationsSection,
  LoadingState,
  SigninState,
  UnavailableState,
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
 *
 * The gate's non-ready kinds describe the COMPOSIO catalog only: the key-free
 * custom provider (HOU-550) is served independently, so when the gate reports
 * `customAvailable` the page still renders the Custom integrations section —
 * with the catalog's own state (sign-in card / catalog-unavailable note)
 * scoped to the catalog instead of blanking the whole page.
 */
export function IntegrationsView() {
  const { t } = useTranslation("integrations");
  const { capabilities } = useCapabilities();
  const gate = useIntegrationsGate();

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
            ) : gate.customAvailable ? (
              <div className="space-y-8">
                <CustomIntegrationsSection />
                {gate.kind === "signin" ? (
                  <SigninState
                    onSignIn={gate.signIn}
                    signingIn={gate.signingIn}
                  />
                ) : (
                  <p className="text-sm text-ink-muted">
                    {t("custom.catalogUnavailable")}
                  </p>
                )}
              </div>
            ) : gate.kind === "signin" ? (
              <SigninState onSignIn={gate.signIn} signingIn={gate.signingIn} />
            ) : (
              <UnavailableState />
            )}
          </>
        )}
      </PageContainer>
    </div>
  );
}
