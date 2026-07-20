import { pingStoreInstall } from "@houston-ai/engine-client";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { getEngine } from "./engine";
import { reportError } from "./error-toast";
import {
  legacyListen,
  osIsTauri,
  osTakePendingStoreDeepLink,
} from "./os-bridge";
import {
  decideStoreInstallDrive,
  initialStoreInstallDriveState,
} from "./store-install-drive";
import { parseStoreInstallSlug } from "./store-install-slug";

export { parseStoreInstallSlug } from "./store-install-slug";

/** Raw Tauri event the Rust shell emits when it receives an
 * `houston://store/install` deep link while the app is already running. Fully
 * disjoint from the `auth://deep-link` channel — the two never share state. */
const STORE_DEEP_LINK_EVENT = "store://deep-link";

/**
 * Always-on hook that turns an `houston://store/install?slug=<slug>` deep link
 * (desktop) or a `?install=<slug>` web param into a seeded import wizard — the
 * SAME preview + scan + name + picker flow every other install uses. It never
 * auto-installs: the deep link only seeds the wizard, so the user still makes
 * every choice.
 *
 * Three ingress paths, one processing effect:
 *  1. Warm desktop: the `store://deep-link` Tauri event fires with the raw URL.
 *  2. Cold desktop: the shell stashed the URL before the webview existed;
 *     `take_pending_store_deep_link` drains it once on mount.
 *  3. Web: `?install=<slug>` in the query string, stripped from history so a
 *     reload does not re-trigger.
 *
 * Every path validates the slug (via `parseStoreInstallSlug` / `SLUG_REGEX`)
 * before it can reach the seed flow, then routes through one pending slug so the
 * install runs exactly once, only when the shell is live and no wizard is open.
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
  useEffect(() => {
    const setPending = (raw: string) => {
      const slug = parseStoreInstallSlug(raw);
      if (slug) useUIStore.getState().setPendingStoreInstallSlug(slug);
    };

    // Warm desktop: the raw URL rides the event payload. The web shim makes
    // `legacyListen` a no-op, so this is harmless in the browser.
    let off: (() => void) | undefined;
    legacyListen<string>(STORE_DEEP_LINK_EVENT, (ev) => setPending(ev.payload))
      .then((fn) => {
        off = fn;
      })
      .catch((err: unknown) => {
        reportError(
          "store_install_deeplink",
          "failed to register store deep-link listener",
          err,
        );
      });

    // Cold desktop: drain whatever the shell stashed before we could listen.
    if (osIsTauri()) {
      osTakePendingStoreDeepLink()
        .then((raw) => {
          if (raw) setPending(raw);
        })
        .catch((err: unknown) => {
          reportError(
            "store_install_deeplink",
            "failed to drain pending store deep-link",
            err,
          );
        });
    } else {
      // Web: read `?install=<slug>` once, then strip it so a reload does not
      // re-trigger the install (the pending slug lives only in memory).
      const params = new URLSearchParams(window.location.search);
      const install = params.get("install");
      if (install !== null) {
        params.delete("install");
        const query = params.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
        setPending(install);
      }
    }

    return () => {
      off?.();
    };
  }, []);

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
