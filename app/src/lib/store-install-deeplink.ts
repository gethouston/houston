import { pingStoreInstall } from "@houston-ai/engine-client";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { getEngine } from "./engine";
import { reportError } from "./error-toast";
import { subscribeStoreDeepLinks } from "./store-deeplink-ingress";
import {
  decideStoreInstallDrive,
  initialStoreInstallDriveState,
} from "./store-install-drive";

export { parseStoreCreatorHandle } from "./store-creator-handle";
export { parseStoreInstallSlug } from "./store-install-slug";

/**
 * Always-on hook for the two store deep-link shapes the shell forwards on the
 * shared `store://deep-link` channel:
 *  - `houston://store/install?slug=<slug>` (web `?install=<slug>`) seeds the
 *    import wizard — the SAME preview + scan + name + picker flow every other
 *    install uses. It never auto-installs: the deep link only seeds the wizard.
 *  - `houston://store/creator?handle=<handle>` (web `?creator=<handle>`) opens
 *    the Agent Store on that creator's profile pane.
 *
 * Three ingress paths, one processing effect for installs:
 *  1. Warm desktop: the `store://deep-link` Tauri event fires with the raw URL.
 *  2. Cold desktop: the shell stashed the URL before the webview existed;
 *     `take_pending_store_deep_link` drains it once on mount.
 *  3. Web: `?install=<slug>` / `?creator=<handle>` in the query string, stripped
 *     from history so a reload does not re-trigger.
 *
 * Desktop URLs are disambiguated by path (a bare web param cannot be — a handle
 * also matches `SLUG_REGEX` — so the web branch reads each param explicitly).
 * Installs validate the slug (`SLUG_REGEX`) and route through one pending slug so
 * the install runs exactly once; creators validate the handle (`HANDLE_REGEX`)
 * and open the profile pane. The creator path needs no drive-style dedup: opening
 * a profile is idempotent and side-effect-free (no install, no ping), so a
 * repeat delivery merely re-navigates to the same pane.
 */
export function useStoreInstallDeepLink(): void {
  const { t } = useTranslation("store");
  const pendingSlug = useUIStore((s) => s.pendingStoreInstallSlug);
  const importFromFriendOpen = useUIStore((s) => s.importFromFriendOpen);

  // "Shell is live" — the workspace shell (which mounts the import wizard) is
  // the rendered branch, so seeding it will actually open something: a
  // workspace is resolved, agents have loaded with at least one present (a
  // zero-agent user is still in first-run onboarding, not the shell), and the
  // tutorial is not held in front. Until then the pending slug simply waits.
  const workspaceReady = useWorkspaceStore(
    (s) => !s.loading && Boolean(s.current),
  );
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const hasAgents = useAgentStore((s) => s.agents.length > 0);
  const tutorialActive = useUIStore((s) => s.tutorialActive);
  const shellLive =
    workspaceReady && agentsLoaded && hasAgents && !tutorialActive;

  // ── Ingress: register the listeners + drain the cold-start / web sources ──
  // Delegated to `subscribeStoreDeepLinks`, which classifies each raw URL / web
  // param into its action (install → pending slug, driven below; creator → open
  // the profile pane) and returns the listener unsubscribe.
  useEffect(() => subscribeStoreDeepLinks(), []);

  // ── Processing: seed the wizard exactly once, when it can actually open ──
  // The decision (drive / drop-duplicate / wait) lives in the pure reducer
  // `decideStoreInstallDrive`; this effect only carries out the side effect it
  // names. `driveState` is session state that must survive across ticks, so it
  // rides a ref rather than React state.
  const driveState = useRef({ ...initialStoreInstallDriveState });
  useEffect(() => {
    const { next, effect, slug } = decideStoreInstallDrive(driveState.current, {
      pendingSlug,
      wizardOpen: importFromFriendOpen,
      shellLive,
    });
    driveState.current = next;

    // Duplicate delivery of the slug already driven (website button
    // double-click, or the cold-start drain and the live event both surfacing
    // the same URL). Clear it so it can never re-fire when the wizard closes.
    if (effect === "drop") {
      useUIStore.getState().setPendingStoreInstallSlug(null);
      return;
    }
    if (effect !== "drive" || !slug) return;

    // Clear the pending slug now that we own this drive; the reducer's
    // duplicate guard (keyed on the driven slug) blocks any re-delivery.
    useUIStore.getState().setPendingStoreInstallSlug(null);

    void (async () => {
      try {
        const preview = await getEngine().importFromStoreLink(slug);
        const ui = useUIStore.getState();
        ui.setImportSeedPreview(preview);
        ui.setImportFromFriendOpen(true);
        pingStoreInstall(slug).catch((err: unknown) => {
          reportError(
            "store_install_deeplink",
            `install ping failed (${slug})`,
            err,
          );
        });
      } catch (err) {
        reportError(
          "store_install_deeplink",
          `store install deep link failed (${slug})`,
          err,
        );
        useUIStore.getState().addToast({
          variant: "error",
          title: t("installFailed"),
        });
      } finally {
        driveState.current = { ...driveState.current, running: false };
      }
    })();
  }, [pendingSlug, importFromFriendOpen, shellLive, t]);
}
