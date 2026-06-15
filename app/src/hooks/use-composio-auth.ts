import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isHoustonEngineError } from "@houston-ai/engine-client";
import { tauriConnections, tauriSystem } from "../lib/tauri";
import { logger } from "../lib/logger";

/**
 * State of the Composio sign-in dialog.
 *
 * New shape: the UUID and URL are generated CLIENT-SIDE. The dialog
 * flips to `waiting` state and opens the browser with a URL that
 * Composio's dashboard treats as a rendezvous key. The backend is
 * only touched during the `complete_composio_login` call that polls
 * until the user has approved in the browser.
 *
 * Why: previously we called `start_composio_oauth` first, which on
 * macOS Tauri occasionally hung inside `tokio::process::Command::
 * output().await` with no visible error. By computing the URL in JS
 * we eliminate any Rust call from the visible "open browser" step,
 * so the worst case is "browser didn't auto-open" (which we also
 * cover with a fallback button).
 */
export interface ComposioAuthState {
  open: boolean;
  /** Current phase of the flow. */
  phase: "idle" | "waiting" | "error";
  /** URL the user can click to open/re-open the Composio dashboard. */
  loginUrl: string | null;
  error: string | null;
}

export function useComposioAuth(onSuccess: () => void | Promise<void>) {
  const { t } = useTranslation("integrations");
  const [state, setState] = useState<ComposioAuthState>({
    open: false,
    phase: "idle",
    loginUrl: null,
    error: null,
  });

  // Generation counter: lets us discard stale results if the user
  // restarts the flow before the previous attempt resolves.
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startAuth = useCallback(async () => {
    const myGen = ++genRef.current;

    // Show dialog immediately in "waiting" state.
    setState({ open: true, phase: "waiting", loginUrl: null, error: null });

    try {
      // 1. Get the login URL from the backend.
      logger.info("[composio-auth] calling startOAuth...");
      const { login_url, cli_key } = await tauriConnections.startOAuth();
      // Never log `cli_key` OR the raw `login_url`: the URL embeds the same
      // secret as a `?cliKey=<cli_key>` query param. Strip the query string so
      // only host + path is logged; frontend.log is bundled into bug reports
      // (HOU-431).
      logger.info(
        `[composio-auth] startOAuth returned: url=${login_url.replace(/[?#].*$/, "")}`,
      );

      // 2. ALWAYS surface the URL and open the browser — no stale-gen
      //    check here. Even if the component re-rendered during the
      //    500ms backend call (TanStack refetch, tab switch, etc.),
      //    the user still expects the browser to open.
      setState((s) => ({ ...s, loginUrl: login_url }));
      logger.info("[composio-auth] opening browser...");
      try {
        await tauriSystem.openUrl(login_url);
        logger.info("[composio-auth] openUrl resolved OK");
      } catch (urlErr) {
        logger.error("[composio-auth] openUrl FAILED:", String(urlErr));
      }

      // 3. Block on the CLI until the user approves (or 5 min timeout).
      //    THIS is the only step where a stale-gen check matters —
      //    we don't want an old flow's completion to overwrite the
      //    current state.
      logger.info("[composio-auth] calling completeLogin...");
      await tauriConnections.completeLogin(cli_key);
      logger.info("[composio-auth] completeLogin resolved OK");
      if (!mountedRef.current || genRef.current !== myGen) {
        logger.info("[composio-auth] stale gen after completeLogin, not updating state");
        return;
      }

      setState({ open: false, phase: "idle", loginUrl: null, error: null });
      await onSuccess();
    } catch (e) {
      if (!mountedRef.current || genRef.current !== myGen) return;
      // Already signed in (the CLI no-ops when creds exist, e.g. signed in
      // elsewhere or a stale status). Not an error: close and refresh so the
      // UI snaps to the connected state.
      if (isHoustonEngineError(e) && e.kind === "composio_already_signed_in") {
        logger.info("[composio-auth] already signed in, refreshing");
        setState({ open: false, phase: "idle", loginUrl: null, error: null });
        await onSuccess();
        return;
      }
      logger.error("[composio-auth] flow error:", String(e));
      // Localize for the user. A `composio_login_timeout` is the expected
      // "you didn't finish approving in the browser" case; everything
      // else collapses to a generic retry prompt so we never surface a
      // raw engine string. The real detail is logged above and (for
      // genuine faults) captured to Sentry by the engine-call wrapper.
      const message =
        isHoustonEngineError(e) && e.kind === "composio_login_timeout"
          ? t("authDialog.errorTimeout")
          : t("authDialog.errorGeneric");
      setState((s) => ({ ...s, phase: "error", error: message }));
    }
  }, [onSuccess, t]);

  const reopenBrowser = useCallback(() => {
    if (state.loginUrl) {
      tauriSystem.openUrl(state.loginUrl).catch(() => {});
    }
  }, [state.loginUrl]);

  const close = useCallback(() => {
    // Cancel the in-flight flow by bumping the generation: any
    // pending completeLogin resolution from this generation will be
    // discarded when it finally returns. The Rust subprocess will
    // still run to completion (the engine's 3 min cap), but the UI
    // won't react to it. A proper backend cancel is a follow-up.
    genRef.current += 1;
    setState({ open: false, phase: "idle", loginUrl: null, error: null });
  }, []);

  return { state, startAuth, reopenBrowser, close };
}
