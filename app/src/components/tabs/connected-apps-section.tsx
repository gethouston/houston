import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@houston-ai/core";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { useInvalidateConnections } from "../../hooks/queries";
import { useComposioRefetchOnReturn } from "../../hooks/use-composio-refetch-on-return";
import { useUIStore } from "../../stores/ui";
import { showErrorToast } from "../../lib/error-toast";
import {
  ConnectedAppCard,
  type CardBusy,
  type ConnectedAppInfo,
} from "./connected-app-card";

interface ConnectedAppsSectionProps {
  connectedToolkits: Set<string>;
  /** Composio workspace slug (whoami's default_org_name) for deep-links. */
  orgName?: string | null;
}

export function ConnectedAppsSection({
  connectedToolkits,
  orgName,
}: ConnectedAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const invalidate = useInvalidateConnections();
  const markWaitingForAuth = useComposioRefetchOnReturn();
  const addToast = useUIStore((s) => s.addToast);

  const { data: apiApps } = useQuery({
    queryKey: ["composio-apps"],
    queryFn: () => tauriConnections.listApps(),
    staleTime: 1000 * 60 * 60,
  });

  const [busy, setBusy] = useState<Record<string, CardBusy>>({});
  const [pendingDisconnect, setPendingDisconnect] =
    useState<ConnectedAppInfo | null>(null);

  const connectedApps = useMemo<ConnectedAppInfo[]>(() => {
    const byToolkit = new Map(
      (apiApps ?? []).map((a) => [
        a.toolkit,
        {
          toolkit: a.toolkit,
          name: a.name,
          description: a.description,
          logoUrl: a.logo_url || fallbackLogo(a.toolkit),
        },
      ]),
    );
    return Array.from(connectedToolkits)
      .map(
        (slug) =>
          byToolkit.get(slug) ?? {
            toolkit: slug,
            name: slug,
            description: t("connected.title"),
            logoUrl: fallbackLogo(slug),
          },
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apiApps, connectedToolkits, t]);

  const setCardBusy = useCallback((toolkit: string, state: CardBusy) => {
    setBusy((prev) => ({ ...prev, [toolkit]: state }));
  }, []);

  const handleManage = useCallback(
    (toolkit: string) => {
      // `openUrl` is a raw OS-bridge call (not routed through `call()`),
      // so surface its failure instead of letting it fail silently.
      void tauriSystem
        .openUrl(composioAppUrl(toolkit, orgName))
        .catch((err) => showErrorToast("composio_open_manage", String(err)));
    },
    [orgName],
  );

  const handleReconnect = useCallback(
    async (app: ConnectedAppInfo) => {
      setCardBusy(app.toolkit, "reconnecting");
      try {
        const { redirectUrl } = await tauriConnections.reconnectApp(app.toolkit);
        if (redirectUrl) {
          // OAuth scheme: open the browser for re-consent. `openUrl` is a
          // raw OS-bridge call that does NOT route through `call()`, so we
          // surface its failure here and only confirm once it opened.
          try {
            await tauriSystem.openUrl(redirectUrl);
          } catch (err) {
            showErrorToast("reconnect_open_url", String(err));
            return;
          }
          // Refetch when the user returns from the browser.
          markWaitingForAuth(app.toolkit);
          addToast({
            variant: "success",
            title: t("connected.reconnect.openedTitle", { name: app.name }),
            description: t("connected.reconnect.openedBody"),
          });
        } else {
          // Non-redirect scheme refreshed silently.
          await invalidate();
          addToast({
            variant: "success",
            title: t("connected.reconnect.doneTitle", { name: app.name }),
          });
        }
      } catch {
        // Surfaced by `call()` as an error toast.
      } finally {
        setCardBusy(app.toolkit, null);
      }
    },
    [addToast, invalidate, markWaitingForAuth, setCardBusy, t],
  );

  const handleDisconnect = useCallback(
    async (app: ConnectedAppInfo) => {
      setCardBusy(app.toolkit, "disconnecting");
      try {
        await tauriConnections.disconnectApp(app.toolkit);
      } catch {
        // Surfaced by `call()` as an error toast.
      } finally {
        // Always refresh: a partial delete (some accounts removed before a
        // failure) must still drop those from the card.
        await invalidate();
        setCardBusy(app.toolkit, null);
      }
    },
    [invalidate, setCardBusy],
  );

  if (connectedApps.length === 0) {
    return null;
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">
          {t("connected.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("connected.count", { count: connectedApps.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {connectedApps.map((app) => (
          <ConnectedAppCard
            key={app.toolkit}
            app={app}
            busy={busy[app.toolkit] ?? null}
            onManage={() => handleManage(app.toolkit)}
            onReconnect={() => handleReconnect(app)}
            onDisconnect={() => setPendingDisconnect(app)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
        title={t("connected.disconnect.confirmTitle", {
          name: pendingDisconnect?.name ?? "",
        })}
        description={t("connected.disconnect.confirmBody", {
          name: pendingDisconnect?.name ?? "",
        })}
        confirmLabel={t("connected.disconnect.confirmAction")}
        cancelLabel={t("connected.disconnect.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDisconnect) void handleDisconnect(pendingDisconnect);
        }}
      />
    </section>
  );
}

function composioAppUrl(toolkit: string, orgName?: string | null): string {
  // Deep-link straight to the app's page in the user's Composio dashboard
  // workspace. `orgName` is the workspace slug from the signed-in account
  // (whoami's default_org_name, e.g. "<user>_workspace"); the inner `~` is
  // Composio's "current project" placeholder. A bare `~` workspace is
  // unreliable (it can land on a workspace-less page), so we only fall
  // back to it when the slug is unknown.
  const workspace =
    orgName && orgName.trim() ? encodeURIComponent(orgName.trim()) : "~";
  return `https://dashboard.composio.dev/${workspace}/~/connect/apps/${toolkit}`;
}

function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
