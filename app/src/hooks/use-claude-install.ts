import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonEvent } from "@houston-ai/core";
import type { ClaudeInstallError } from "@houston-ai/engine-client";
import { subscribeHoustonEvents } from "../lib/events";
import { tauriClaude } from "../lib/tauri";
import { logger } from "../lib/logger";

/**
 * Localize a typed install failure. The engine is i18n-agnostic — it
 * emits a stable `kind` slug (`ClaudeInstallError`) and we map it to the
 * app's en/es/pt copy here. `detail` is deliberately NOT shown to the
 * user; it rides along on the error for the Report-bug bundle / logs.
 *
 * Exposed as a hook (not a plain fn) so callers don't have to thread a
 * `t` through — both consumers (the inline hint + the global
 * `ClaudeCliFailed` toast) already run inside React.
 */
export function useClaudeInstallErrorText(): (error: ClaudeInstallError) => string {
  const { t } = useTranslation("providers");
  return (error: ClaudeInstallError): string => {
    switch (error.kind) {
      case "timeout":
        return t("claudeInstall.errors.timeout");
      case "network_unreachable":
        return t("claudeInstall.errors.networkUnreachable");
      case "download_interrupted":
        return t("claudeInstall.errors.downloadInterrupted");
      case "http_error":
        return t("claudeInstall.errors.httpError", { status: error.status ?? 0 });
      case "checksum_mismatch":
        return t("claudeInstall.errors.checksumMismatch");
      case "platform_unsupported":
        return t("claudeInstall.errors.platformUnsupported");
      case "write_failed":
        return t("claudeInstall.errors.writeFailed");
      // Dev-only manifest problems collapse to a generic "couldn't
      // start" so we never leak the internal manifest hint to users.
      case "manifest_missing":
      case "manifest_entry_missing":
        return t("claudeInstall.errors.unavailable");
      case "unknown":
        return t("claudeInstall.errors.unknown");
      default:
        // Wire drift: a newer engine sent a kind this build doesn't
        // know. Degrade to the generic message rather than render blank.
        return t("claudeInstall.errors.unknown");
    }
  };
}

/**
 * Live state of the Anthropic Claude Code runtime install — the install
 * Houston runs on the user's behalf because the proprietary CLI can't
 * be bundled. Used by both the onboarding "Sign in with Anthropic" card
 * and the Settings → Provider row so the user sees the real reason
 * install failed (issue #231: a bad wifi connection used to surface as
 * the generic "install the claude CLI on your machine" hint, which is
 * wrong because Houston should be doing the install).
 */
export interface ClaudeInstallState {
  /** True between `ClaudeCliInstalling` and `ClaudeCliReady`/`ClaudeCliFailed`. */
  installing: boolean;
  /** `0..=100`, or `null` if the engine never sent a progress event yet. */
  progressPct: number | null;
  /** Typed failure from the engine, or `null` after a clean install.
   *  Localize for display with {@link useClaudeInstallErrorText}. */
  error: ClaudeInstallError | null;
  /**
   * Trigger a fresh install. The HTTP call returns immediately; the
   * state in this hook flips on the resulting WS events.
   */
  retry: () => Promise<void>;
}

interface UseClaudeInstallOpts {
  /** Fires once when the engine emits `ClaudeCliReady`. Use it to
   *  refresh dependent state (e.g. the provider-status query that
   *  decides whether the "Sign in" button is enabled). */
  onReady?: () => void;
  /** Fires once per `ClaudeCliFailed` so callers can surface a toast.
   *  Separate from the in-component error display to keep concerns
   *  decoupled (the inline card always shows; the toast is a global
   *  affordance). */
  onFailed?: (error: ClaudeInstallError) => void;
}

export function useClaudeInstall(opts: UseClaudeInstallOpts = {}): ClaudeInstallState {
  const [installing, setInstalling] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [error, setError] = useState<ClaudeInstallError | null>(null);

  // Stable refs so the subscription effect doesn't tear down whenever
  // the parent re-renders with a new lambda.
  const callbacksRef = useRef(opts);
  callbacksRef.current = opts;

  // Seed from the engine on mount so the UI can render the
  // last-known-bad state immediately, even before any new event
  // arrives. Without this seed, a user who refreshes the page after a
  // failed boot install would see "preparing..." and miss the actual
  // error until they manually retry.
  useEffect(() => {
    let cancelled = false;
    void tauriClaude
      .status()
      .then((s) => {
        if (cancelled) return;
        if (s.installed) {
          setError(null);
          return;
        }
        if (s.lastInstallError) setError(s.lastInstallError);
      })
      .catch((err: unknown) => {
        logger.warn(`[claude-install] status fetch failed: ${String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((event: HoustonEvent) => {
      switch (event.type) {
        case "ClaudeCliInstalling":
          setInstalling(true);
          setProgressPct(event.data.progress_pct);
          setError(null);
          break;
        case "ClaudeCliReady":
          setInstalling(false);
          setProgressPct(null);
          setError(null);
          callbacksRef.current.onReady?.();
          break;
        case "ClaudeCliFailed":
          setInstalling(false);
          setProgressPct(null);
          setError(event.data.error);
          callbacksRef.current.onFailed?.(event.data.error);
          break;
      }
    });
    return unlisten;
  }, []);

  const retry = useCallback(async () => {
    setError(null);
    setInstalling(true);
    setProgressPct(0);
    try {
      await tauriClaude.install();
    } catch (err) {
      // The install route returns 202 immediately and reports the real
      // outcome over the WS firehose, so this only fires when the HTTP
      // request itself couldn't be made (engine unreachable). Roll the
      // state back so the UI doesn't get stuck at 0% forever, and carry
      // the transport detail for the bug report.
      setInstalling(false);
      setProgressPct(null);
      setError({ kind: "unknown", detail: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return { installing, progressPct, error, retry };
}
