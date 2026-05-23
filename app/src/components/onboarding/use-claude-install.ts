import { useCallback, useEffect, useRef, useState } from "react";
import type { HoustonEvent } from "@houston-ai/core";
import { subscribeHoustonEvents } from "../../lib/events";
import { tauriClaude } from "../../lib/tauri";
import { logger } from "../../lib/logger";

/**
 * Live state of the Anthropic Claude Code runtime install — the install
 * Houston runs on the user's behalf because the proprietary CLI can't
 * be bundled. Used by the onboarding "Sign in with Anthropic" card so
 * the user sees the real reason install failed (issue #231: a bad wifi
 * connection used to surface as the generic "install the claude CLI on
 * your machine" hint, which is wrong because Houston should be doing
 * the install).
 */
export interface ClaudeInstallState {
  /** True between `ClaudeCliInstalling` and `ClaudeCliReady`/`ClaudeCliFailed`. */
  installing: boolean;
  /** `0..=100`, or `null` if the engine never sent a progress event yet. */
  progressPct: number | null;
  /** User-readable failure reason from the engine. `null` after a clean install. */
  errorMessage: string | null;
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
  onFailed?: (message: string) => void;
}

export function useClaudeInstall(opts: UseClaudeInstallOpts = {}): ClaudeInstallState {
  const [installing, setInstalling] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          setErrorMessage(null);
          return;
        }
        if (s.lastInstallError) setErrorMessage(s.lastInstallError);
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
          setErrorMessage(null);
          break;
        case "ClaudeCliReady":
          setInstalling(false);
          setProgressPct(null);
          setErrorMessage(null);
          callbacksRef.current.onReady?.();
          break;
        case "ClaudeCliFailed":
          setInstalling(false);
          setProgressPct(null);
          setErrorMessage(event.data.message);
          callbacksRef.current.onFailed?.(event.data.message);
          break;
      }
    });
    return unlisten;
  }, []);

  const retry = useCallback(async () => {
    setErrorMessage(null);
    setInstalling(true);
    setProgressPct(0);
    try {
      await tauriClaude.install();
    } catch (err) {
      // The HTTP request itself rejected (engine route surfaced a
      // synchronous error, e.g. manifest missing in a degraded dev
      // build). Roll the state back so the UI doesn't get stuck at
      // 0% forever.
      setInstalling(false);
      setProgressPct(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return { installing, progressPct, errorMessage, retry };
}
