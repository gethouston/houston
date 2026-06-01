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
}

export function ConnectedAppsSection({
  connectedToolkits,
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
            onManage={() => tauriSystem.openUrl(composioAppUrl(app.toolkit))}
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

function composioAppUrl(toolkit: string): string {
  // Route through Composio's marketing site with the Houston-tagged
  // fragment instead of `dashboard.composio.dev/~/connect/apps/<toolkit>`.
  // The bare-dashboard URL relies on `~` resolving to the user's default
  // workspace, which was observed not to work for at least one alpha
  // user (Composio routed them to a workspace-less page that does
  // nothing). The marketing-site URL is the same one the tutorial chat
  // card emits and it goes through Composio's auth → user's workspace
  // → connect-app routing, which works reliably.
  return `https://composio.dev/#houston_toolkit=${toolkit}`;
}

function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
