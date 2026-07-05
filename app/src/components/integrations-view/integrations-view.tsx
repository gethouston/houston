import { useTranslation } from "react-i18next";
import {
  LoadingState,
  SigninState,
  UnavailableState,
  useIntegrationsGate,
} from "../integrations";
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
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {gate.kind === "ready" ? (
          <IntegrationsReady
            reconnectNotice={gate.reconnectNotice}
            dismissReconnect={gate.dismissReconnect}
          />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-[28px] font-normal text-foreground">
                {t("home.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("home.description")}
              </p>
            </div>
            {gate.kind === "loading" ? (
              <LoadingState />
            ) : gate.kind === "signin" ? (
              <SigninState onSignIn={gate.signIn} signingIn={gate.signingIn} />
            ) : (
              <UnavailableState />
            )}
          </>
        )}
      </div>
    </div>
  );
}
