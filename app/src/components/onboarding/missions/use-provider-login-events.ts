import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { beginCodexBrowserLogin } from "../../../lib/codex-loopback";
import { subscribeHoustonEvents } from "../../../lib/events";
import { osIsTauri } from "../../../lib/os-bridge";
import { tauriSystem } from "../../../lib/tauri";
import {
  shouldOpenLoginUrlDirectly,
  shouldUseCodexLoopback,
} from "../../shell/provider-login-url";

/** The remote / device-code fallback the mission renders a dialog for. */
export interface LoginDialogState {
  url: string;
  userCode: string | null;
}

/**
 * The onboarding login step's share of the `ProviderLoginUrl` /
 * `ProviderLoginComplete` bus. On the legacy Rust wire the CLI opens the
 * browser itself and no URL event fires locally, but on the v3 wire the
 * runtime can't touch the user's browser — the adapter surfaces the OAuth URL
 * as an event and expects the ACTIVE view to act on it. The shell's provider
 * picker/settings do; this hook gives the onboarding mission the same three
 * branches (mirroring `provider-picker.tsx`):
 *
 *  1. Codex/OpenAI on desktop, no device code → the zero-code loopback relay.
 *  2. Any provider on desktop, no device code → open the browser directly.
 *  3. Otherwise (device code, or a web/remote client with no local browser to
 *     reach) → hand back dialog state for <ProviderLoginDialog>.
 */
export function useProviderLoginEvents(opts: {
  /** The frontend provider id this step is connecting (events are filtered to it). */
  providerId: string;
  /** A failed browser open — surface it (the user sees a stuck "waiting" otherwise). */
  onOpenFailed: (message: string) => void;
  /**
   * The attempt ended without success (`ProviderLoginComplete`,
   * `success: false`). `error` is null for a benign cancel.
   */
  onFailed: (error: string | null) => void;
}): { dialog: LoginDialogState | null; closeDialog: () => void } {
  const [dialog, setDialog] = useState<LoginDialogState | null>(null);

  // The callbacks live in refs so the subscription mounts once per provider —
  // resubscribing on every parent render could drop an event in the gap.
  const onOpenFailedRef = useRef(opts.onOpenFailed);
  onOpenFailedRef.current = opts.onOpenFailed;
  const onFailedRef = useRef(opts.onFailed);
  onFailedRef.current = opts.onFailed;

  const { providerId } = opts;
  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        if (ev.data.provider !== providerId) return;
        if (
          shouldUseCodexLoopback({
            provider: ev.data.provider,
            isDesktop: osIsTauri(),
            userCode: ev.data.user_code,
          })
        ) {
          // Desktop ChatGPT sign-in with zero device code: bind our own
          // localhost listener and relay the callback. Surfaces its own
          // failure toast and never leaves an orphaned listener.
          void beginCodexBrowserLogin(ev.data.provider, ev.data.url);
          return;
        }
        if (
          shouldOpenLoginUrlDirectly({
            isDesktop: osIsTauri(),
            userCode: ev.data.user_code,
          })
        ) {
          tauriSystem.openUrl(ev.data.url).catch((err) => {
            onOpenFailedRef.current(
              err instanceof Error ? err.message : String(err),
            );
          });
          return;
        }
        // Device-code, or a web/remote client: show the dialog. Keep a code
        // already shown if a later URL-only frame arrives (codex device flow
        // can emit twice).
        setDialog((current) => ({
          url: ev.data.url,
          userCode: ev.data.user_code ?? current?.userCode ?? null,
        }));
        return;
      }
      if (ev.type === "ProviderLoginComplete") {
        if (ev.data.provider !== providerId) return;
        setDialog(null);
        if (!ev.data.success) onFailedRef.current(ev.data.error ?? null);
        // Success needs no handling here: the mission's status poll flips the
        // screen to connected and advances.
      }
    });
  }, [providerId]);

  return { dialog, closeDialog: () => setDialog(null) };
}
