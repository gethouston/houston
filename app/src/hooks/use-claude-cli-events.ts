import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonEvent } from "@houston-ai/core";
import { subscribeHoustonEvents } from "../lib/events";
import { tauriProvider } from "../lib/tauri";
import { useUIStore } from "../stores/ui";
import { logger } from "../lib/logger";

/**
 * Subscriber for the `claude` WS topic — closes the loop on #231.
 *
 * Engine emits three lifecycle events from `houston-claude-installer`:
 *
 * - `ClaudeCliInstalling { progress_pct }` — recurring during the
 *   ~120 MB download. We intentionally do NOT toast each tick (10%
 *   increments × 5 = 5 toasts a user would dismiss); the install
 *   progress UI itself is a separate surface tracked elsewhere.
 * - `ClaudeCliReady` — install finished (or already at the pinned
 *   version). Re-runs the provider status check so the Anthropic chip
 *   and "claudeAvailable" gate flip without a launch.
 * - `ClaudeCliFailed { message }` — fatal install error. `message` is
 *   the engine's pre-formatted user-facing string and ALREADY carries
 *   pinned version, source URL, target path, and HTTP status / SHA
 *   mismatch hex / OS error (see `houston-claude-installer/src/error.rs`
 *   `install_err`). We surface it verbatim through `addToast` as an
 *   error variant — the toast container renders plain text with the
 *   error icon and dismiss control (`ui/core/src/components/toast-container.tsx`).
 *
 * Mounted once in `App.tsx` next to `useAgentInvalidation`. Idempotent.
 */
export function useClaudeCliEvents() {
  const { t } = useTranslation("shell");
  const addToast = useUIStore((s) => s.addToast);
  const setClaudeAvailable = useUIStore((s) => s.setClaudeAvailable);

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      switch (p.type) {
        case "ClaudeCliInstalling":
          // No-op — progress UI lives in its own surface. Log only so
          // we have a breadcrumb if the install hangs.
          logger.debug(
            `[claude-cli] installing: ${p.data.progress_pct}%`,
          );
          break;
        case "ClaudeCliReady":
          logger.info("[claude-cli] ready");
          // Re-run the provider status check — the install just landed
          // and the user's claudeAvailable gate (used by chat / agent
          // creation) should flip without requiring a relaunch. The
          // check is cheap (one Tauri command) and the same path
          // `useHoustonInit` uses on startup, so behavior stays
          // consistent.
          tauriProvider
            .checkStatus("anthropic")
            .then((status) => {
              setClaudeAvailable(
                status.cli_installed && status.authenticated,
              );
            })
            .catch((e) => {
              // The status check failing isn't user-actionable here —
              // worst case the user sees the chip flip on next launch.
              // Log so support has a breadcrumb if they ask why.
              logger.warn(
                `[claude-cli] post-install status check failed: ${e}`,
              );
            });
          break;
        case "ClaudeCliFailed":
          // Engine-provided message already carries every actionable
          // field (version, URL, status code or SHA hex, target path,
          // OS error). Surface verbatim per CLAUDE.md §"No silent
          // failures" — the toast IS the user-facing error.
          logger.error(`[claude-cli] failed: ${p.data.message}`);
          addToast({
            title: t("claudeCli.installFailedTitle"),
            description: p.data.message,
            variant: "error",
          });
          break;
      }
    });

    return () => {
      unlisten();
    };
  }, [addToast, setClaudeAvailable, t]);
}
