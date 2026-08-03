/**
 * The reconnect lifecycle behind `UnauthenticatedCard` — every side effect the
 * card has, with none of its rendering. The component reads the phase this
 * returns and maps it to copy through `resolveAuthCardPresentation`.
 *
 * The button must not fire-and-forget: `launchLogin` resolves when the engine
 * STARTS sign-in, not when the user finishes in the browser — completion
 * arrives later as the `ProviderLoginComplete` event. So the hook holds a
 * "waiting" phase (the card turns its pill into a Cancel that frees the login
 * slot and re-arms) until that event flips it to `done`, `failed`, or back to
 * idle on a benign cancel.
 *
 * Signing in IS the remaining intent, so a successful reconnect resumes the
 * conversation automatically (once). What gets sent depends on what failed: a
 * refused SEND (`failed_prompt`: the message never reached the engine) resends
 * the original prompt; a mid-turn failure sends a hidden auto-continue nudge
 * (that turn already has server-side context) — the split lives in the panel's
 * `onRetry`.
 *
 * Every launch is cancelLogin -> launchLogin: the engine keeps one login slot
 * per provider and rejects a second launch as "already pending", so a relaunch
 * frees the slot first (cancelLogin is idempotent). The benign completion our
 * own cancel triggers is ignored via `relaunchingRef` so the card does not
 * flicker to idle mid-relaunch.
 */

import type { ProviderError } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { subscribeHoustonEvents } from "../../../lib/events";
import { getProvider } from "../../../lib/providers";
import { tauriProvider } from "../../../lib/tauri";
import { AI_HUB_VIEW_ID } from "../../../lib/top-level-views";
import { useUIStore } from "../../../stores/ui";
import type { LoginPhase } from "./auth-presentation";
import { type ReconnectSurface, reconnectSurface } from "./reconnect-surface";

export interface ProviderLogin {
  phase: LoginPhase;
  /** A launch is in flight (the Reconnect pill spins). */
  launching: boolean;
  /** The engine's reason for a failed sign-in, interpolated into the body. */
  failureDetail: string | null;
  /** The auto-resume is running (the "Signed in" badge spins). */
  retrying: boolean;
  showConnectDialog: boolean;
  /** Which surface Reconnect opens; `null` when the error names no provider. */
  surface: ReconnectSurface | null;
  reconnect: () => Promise<void>;
  cancelSignIn: () => Promise<void>;
  closeConnectDialog: () => void;
}

export function useProviderLogin(
  error: Extract<ProviderError, { kind: "unauthenticated" }>,
  onRetry?: () => Promise<void> | void,
): ProviderLogin {
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [launching, setLaunching] = useState(false);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const relaunchingRef = useRef(false);
  // The auto-resend must fire ONCE per card — a second fire (the provider can
  // complete several logins while the chat stays open) would double-send.
  const autoResendFiredRef = useRef(false);
  // In a ref so the subscription mounts once (resubscribing per render could
  // drop a completion event in the gap).
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type !== "ProviderLoginComplete") return;
      if (error.provider) {
        if (ev.data.provider !== error.provider) return;
      } else if (!ev.data.success) {
        // No provider on the error: ANY connect satisfies this card, so a
        // SUCCESS must not be filtered out — the auto-resume below has to
        // fire. A failure is a different story: this card launched nothing,
        // so an unrelated provider's failed or abandoned login says nothing
        // about it and must not move its phase.
        return;
      }
      if (ev.data.success) {
        setPhase("done");
        setFailureDetail(null);
        // Login succeeded — clear the global flag so other surfaces (store
        // reconnect card, error suppression) stop treating it as signed out.
        // Keyed off the COMPLETED provider (identical to `error.provider` on
        // the guarded path above, and the only known id on the generic one).
        if (useUIStore.getState().authRequired === ev.data.provider) {
          setAuthRequired(null);
        }
        if (onRetryRef.current && !autoResendFiredRef.current) {
          autoResendFiredRef.current = true;
          setRetrying(true);
          void Promise.resolve(onRetryRef.current())
            // The send surfaces its own failure (toast + Report bug); this
            // catch only stops an unhandled rejection.
            .catch(() => {})
            .finally(() => setRetrying(false));
        }
      } else if (ev.data.error) {
        setPhase("failed");
        setFailureDetail(ev.data.error);
      } else if (!relaunchingRef.current) {
        // Benign cancel (user gave up on the OAuth tab) — re-arm quietly.
        // Skipped when WE issued the cancel as the first half of a relaunch:
        // the new login is spawning and the card must stay in its waiting state.
        setPhase("idle");
      }
    });
  }, [error.provider, setAuthRequired]);

  // Which surface Reconnect opens: OAuth's browser login, the api-key paste
  // dialog, or the local endpoint dialog. Non-OAuth providers must NEVER hit
  // launchLogin — the engine 400s ("nvidia does not use OAuth sign-in") and
  // the card dead-ends in its failed phase with no way out (HOU-1077). Both
  // dialogs fire the same `ProviderLoginComplete` on a successful connect, so
  // the auto-resume above runs for every surface. No provider = no surface:
  // `reconnectSurface` defaults unknown ids to that same dead-ending login.
  const surface = error.provider
    ? reconnectSurface(error.provider, getProvider(error.provider)?.auth)
    : null;

  const reconnect = async () => {
    if (launching) return;
    // Nothing to sign in to: hand the user the AI Hub, the one surface that
    // lists every provider and owns the connect flow (OAuth / api-key / local).
    if (!surface) {
      setViewMode(AI_HUB_VIEW_ID);
      return;
    }
    if (surface !== "oauth_login") {
      setFailureDetail(null);
      setShowConnectDialog(true);
      setPhase("waiting");
      return;
    }
    setLaunching(true);
    relaunchingRef.current = true;
    setFailureDetail(null);
    try {
      await tauriProvider.cancelLogin(error.provider);
      await tauriProvider.launchLogin(error.provider);
      setPhase("waiting");
    } catch {
      setPhase("failed");
    } finally {
      relaunchingRef.current = false;
      setLaunching(false);
    }
  };

  const cancelSignIn = async () => {
    // Dialog surfaces: nothing engine-side to cancel — close and re-arm.
    if (surface !== "oauth_login") {
      setShowConnectDialog(false);
      setPhase("idle");
      return;
    }
    try {
      await tauriProvider.cancelLogin(error.provider);
    } finally {
      setPhase("idle");
    }
  };

  const closeConnectDialog = () => {
    setShowConnectDialog(false);
    setPhase((p) => (p === "waiting" ? "idle" : p));
  };

  return {
    phase,
    launching,
    failureDetail,
    retrying,
    showConnectDialog,
    surface,
    reconnect,
    cancelSignIn,
    closeConnectDialog,
  };
}
