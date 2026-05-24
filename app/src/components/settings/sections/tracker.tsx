import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import {
  useTrackerStatus,
  useTrackerConnect,
  useTrackerDisconnect,
  useTrackerIssues,
  useTrackerSyncNow,
} from "../../../hooks/queries";
import { osOpenUrl } from "../../../lib/os-bridge";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import {
  ConnectedCard,
  ConnectingCard,
  ErrorCard,
  NotConnectedCard,
} from "./tracker-cards";

/**
 * Settings → Workspace → Tracker integration.
 *
 * V1: Linear-only, per-agent. The "Connect Linear" button POSTs to the
 * engine with the current agent's `folderPath`; the engine writes
 * `connection.json` under `<agent>/.houston/trackers/linear/`. The
 * engine returns an OAuth authorize URL; we open it in the user's
 * default browser. The engine handles Linear's redirect on its
 * loopback callback port (19824) and finishes the dance
 * asynchronously; we poll status every 2s while connecting.
 *
 * Per-agent scope matches Houston's existing skills / activity / etc.
 * scoping (everything lives under each agent's `.houston/`). A
 * workspace-aggregated view (one Linear org shared by every agent in
 * the workspace) is a follow-up — requires the engine to expose
 * workspace paths the app doesn't currently see.
 *
 * Provider selector lands when tracker #2 (Jira / GitHub) ships.
 * Until then the section is hardcoded to `linear`. The card variants
 * live in [tracker-cards.tsx](./tracker-cards.tsx) to keep this file
 * focused on lifecycle wiring.
 */
export function TrackerSection() {
  const { t } = useTranslation(["tracker", "common"]);
  const currentAgent = useAgentStore((s) => s.current);
  const workspacePath = currentAgent?.folderPath;
  const addToast = useUIStore((s) => s.addToast);

  const status = useTrackerStatus("linear", workspacePath);
  const connect = useTrackerConnect("linear", workspacePath);
  const disconnect = useTrackerDisconnect("linear", workspacePath);
  const connecting = status.data?.state === "connecting" || connect.isPending;
  const issues = useTrackerIssues("linear", workspacePath, connecting);
  const syncNow = useTrackerSyncNow("linear", workspacePath);

  if (!workspacePath) {
    return (
      <section>
        <header className="flex items-center gap-3 mb-4">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("tracker:title")}</h2>
        </header>
        <p className="text-sm text-muted-foreground">{t("tracker:noAgent")}</p>
      </section>
    );
  }

  const data = status.data;
  const connected = data?.state === "connected";
  const errored = data?.state === "error" || !!connect.error;
  const errorMessage =
    data?.lastError ?? (connect.error ? String(connect.error) : null);

  async function handleConnect() {
    if (!workspacePath) return;
    try {
      const resp = await connect.mutateAsync({ workspacePath });
      // Open the authorize URL in the user's default browser. Failure
      // here surfaces a toast with the URL so the user can copy-paste
      // as a fallback (some macOS configurations block invoke open).
      try {
        await osOpenUrl(resp.authorizeUrl);
      } catch (e) {
        addToast({
          title: t("tracker:linear.browserFailedTitle"),
          description: t("tracker:linear.browserFailedBody", {
            url: resp.authorizeUrl,
          }),
          variant: "error",
        });
      }
    } catch (e) {
      // The engine route surfaces a typed error already via
      // tauriTrackers.connect (which uses the standard call() helper);
      // re-throw is unnecessary. Toast is already showing.
    }
  }

  async function handleDisconnect() {
    if (!workspacePath) return;
    await disconnect.mutateAsync();
    addToast({ title: t("tracker:linear.disconnectedToast") });
  }

  async function handleSyncNow() {
    if (!workspacePath) return;
    try {
      const summary = await syncNow.mutateAsync();
      if (summary.kind === "synced") {
        addToast({
          title: t("tracker:linear.syncedToast", { count: summary.issuesSeen }),
        });
      }
    } catch (e) {
      // tauriTrackers.syncNow uses the standard call() helper which
      // already surfaces a toast on error — nothing more to do here.
    }
  }

  return (
    <section>
      <header className="flex items-center gap-3 mb-4">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("tracker:title")}</h2>
      </header>

      <p className="text-sm text-muted-foreground mb-6">
        {t("tracker:linear.intro")}
      </p>

      {connected && data ? (
        <ConnectedCard
          orgName={data.orgName ?? t("common:unknown")}
          capabilities={data.capabilities}
          connectedAt={data.connectedAt}
          issuesCount={issues.data?.length}
          issues={issues.data ?? []}
          onDisconnect={handleDisconnect}
          disconnectPending={disconnect.isPending}
          onSyncNow={handleSyncNow}
          syncPending={syncNow.isPending}
        />
      ) : connecting ? (
        <ConnectingCard />
      ) : errored ? (
        <ErrorCard
          message={errorMessage}
          onRetry={handleConnect}
          pending={connect.isPending}
        />
      ) : (
        <NotConnectedCard
          onConnect={handleConnect}
          pending={connect.isPending}
        />
      )}
    </section>
  );
}
