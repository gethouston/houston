import { useTranslation } from "react-i18next";
import {
  CustomIntegrationsSection,
  LoadingState,
  SigninState,
  UnavailableState,
  useIntegrationsGate,
} from "../integrations";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { IntegrationsReady } from "./integrations-ready";

/**
 * The top-level Integrations page (sidebar destination): the caller's PERSONAL
 * connected-apps catalog in every mode (org integration policy lives on the
 * Admin page). Shares the exact gate UX of the per-agent tab (loading /
 * unavailable / signin / ready) via `useIntegrationsGate`.
 *
 * The gate's non-ready kinds describe the COMPOSIO catalog only: the key-free
 * custom provider (HOU-550) is served independently, so when the gate reports
 * `customAvailable` the page still renders the Custom integrations section —
 * with the catalog's own state (sign-in card / catalog-unavailable note)
 * scoped to the catalog instead of blanking the whole page.
 */
export function IntegrationsView() {
  const { t } = useTranslation("integrations");
  const gate = useIntegrationsGate();

  return (
    <div className="h-full overflow-auto">
      <PageContainer className="py-10">
        {gate.kind === "ready" ? (
          <IntegrationsReady
            reconnectNotice={gate.reconnectNotice}
            dismissReconnect={gate.dismissReconnect}
          />
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
