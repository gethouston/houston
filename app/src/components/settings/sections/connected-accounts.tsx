import { useTranslation } from "react-i18next";
import {
  LoadingState,
  SigninState,
  UnavailableState,
  useIntegrationsGate,
} from "../../integrations";
import { ConnectedAccountsBody } from "./connected-accounts-body";

/**
 * Settings > Connected accounts: the account-focused view of the apps the user
 * has connected, with per-app control over which agents may use each one. Same
 * boot/auth gate as the global Integrations page (loading / sign-in /
 * unavailable), then the settings family's title block and the connected-apps
 * body. No inline catalog here (that lives on the global page); connecting MORE
 * apps is offered as a link or a hint depending on the deployment.
 */
export function ConnectedAccountsSection() {
  const { t } = useTranslation("settings");
  const gate = useIntegrationsGate();

  if (gate.kind === "loading") return <LoadingState />;
  if (gate.kind === "signin") {
    return <SigninState onSignIn={gate.signIn} signingIn={gate.signingIn} />;
  }
  if (gate.kind === "unavailable") return <UnavailableState />;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">
        {t("connectedAccounts.title")}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        {t("connectedAccounts.subtitle")}
      </p>
      <ConnectedAccountsBody
        reconnectNotice={gate.reconnectNotice}
        dismissReconnect={gate.dismissReconnect}
      />
    </section>
  );
}
