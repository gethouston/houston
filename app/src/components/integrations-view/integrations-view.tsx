import { useTranslation } from "react-i18next";
import {
  LoadingState,
  SigninState,
  UnavailableState,
  useIntegrationsGate,
} from "../integrations";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { IntegrationsReady } from "./integrations-ready";

/**
 * The top-level Integrations page (sidebar destination): every connected app,
 * which agents use it, per-agent activation, disconnects, and adding new apps.
 * Shares the exact gate UX of the per-agent tab (loading / unavailable / signin
 * / ready) via `useIntegrationsGate`; the ready body owns all the app wiring.
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
