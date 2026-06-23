import { cn } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plug, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationStatus,
  useLogoutIntegration,
} from "../../hooks/queries";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";

const PROVIDER = "composio";

// A short list of common apps for one-click connect. Connecting deep-links to
// Composio's hosted dashboard (it owns the OAuth); the full catalog lives there.
const COMMON_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "slack",
  "notion",
  "github",
  "linear",
] as const;

const btn =
  "inline-flex items-center gap-2 rounded-full border border-black/15 bg-background px-4 h-9 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

export default function IntegrationsTab(_props: TabProps) {
  const { t } = useTranslation("agents");
  const qc = useQueryClient();
  const status = useIntegrationStatus();
  const composio = status.data?.find((p) => p.provider === PROVIDER);
  const connected = !!composio?.connected;

  const connections = useIntegrationConnections(PROVIDER, connected);
  const disconnect = useDisconnectIntegration(PROVIDER);
  const logout = useLogoutIntegration(PROVIDER);

  const [connecting, setConnecting] = useState(false);
  // Stop the login poll loop if the user leaves the tab mid-flow.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // The no-API-key sign-in: open the provider's login URL, then poll until the
  // user finishes there. The key is fetched + stored host-side — never here.
  async function connectAccount() {
    setConnecting(true);
    try {
      const { loginUrl, pollKey } =
        await tauriIntegrations.startLogin(PROVIDER);
      await tauriSystem.openUrl(loginUrl);
      for (let i = 0; i < 150 && !cancelled.current; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled.current) return;
        const res = await tauriIntegrations.pollLogin(PROVIDER, pollKey);
        if (res.status === "linked") {
          await qc.invalidateQueries({
            queryKey: queryKeys.integrationStatus(),
          });
          return;
        }
      }
    } finally {
      if (!cancelled.current) setConnecting(false);
    }
  }

  // Adding an app hands off to the provider's hosted connect (it owns the OAuth).
  async function addApp(toolkit: string) {
    const { redirectUrl } = await tauriIntegrations.connect(PROVIDER, toolkit);
    await tauriSystem.openUrl(redirectUrl);
  }

  const connectedSlugs = new Set(
    (connections.data ?? []).map((c) => c.toolkit),
  );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h2 className="text-lg font-semibold">{t("integrations.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrations.description")}
          </p>
        </header>

        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.loading")}
          </p>
        ) : !connected ? (
          // Not connected → sign in to the user's own Composio account.
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-black/10 bg-card p-6">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t("integrations.composio")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("integrations.connectBlurb")}
            </p>
            <button
              type="button"
              className={btn}
              onClick={connectAccount}
              disabled={connecting}
            >
              {connecting && <RefreshCw className="h-4 w-4 animate-spin" />}
              {connecting
                ? t("integrations.connecting")
                : t("integrations.connect")}
            </button>
          </div>
        ) : (
          // Connected → account, the connected apps, and add/manage.
          <>
            <div className="flex items-center justify-between rounded-2xl border border-black/10 bg-card p-4">
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600" />
                <span>
                  {t("integrations.connectedAs", {
                    email:
                      composio?.account?.email ?? t("integrations.composio"),
                  })}
                </span>
              </div>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                {t("integrations.signOut")}
              </button>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t("integrations.connectedApps")}
              </h3>
              {connections.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t("integrations.loading")}
                </p>
              ) : (connections.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("integrations.noApps")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(connections.data ?? []).map((c) => (
                    <li
                      key={c.connectionId || c.toolkit}
                      className="flex items-center justify-between rounded-xl border border-black/5 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{c.toolkit}</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                        onClick={() => disconnect.mutate(c.toolkit)}
                        disabled={disconnect.isPending}
                      >
                        {t("integrations.disconnect")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t("integrations.addApps")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_TOOLKITS.filter((tk) => !connectedSlugs.has(tk)).map(
                  (tk) => (
                    <button
                      key={tk}
                      type="button"
                      className={cn(btn, "h-8 px-3 text-xs")}
                      onClick={() => addApp(tk)}
                    >
                      {tk}
                    </button>
                  ),
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
