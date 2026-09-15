/**
 * `oauth-loopback` category: one-shot `localhost` listeners and CLI sign-in
 * children only this machine's browser can reach.
 *
 * Keeps desktop sign-in entirely on the user's machine — no website relay and
 * no custom-scheme "open app?" dialog. Web clients have no local listener and
 * use the firebase-js-sdk popup (or a device-code flow) instead.
 */

import { isTauri } from "@tauri-apps/api/core";
import { invokeNative } from "./invoke.ts";

/** The outcome of asking the shell to bind a loopback listener. */
export type OauthLoopbackStart =
  | {
      status: "listening";
      /** `http://127.0.0.1:<port>/auth/callback` — the redirect target for the
       *  loopback+PKCE flow (the GCIP-brokered flow derives its `localhost`
       *  continueUri from `port` instead). */
      redirectUri: string;
      /** The bound loopback port; both `127.0.0.1` and `::1` listen on it. */
      port: number;
      /** Identifies this attempt's listener. `osCancelOauthLoopback` only acts
       *  when it carries this id, so a late cancel can never free a NEWER
       *  attempt's port. */
      attemptId: number;
    }
  | {
      /** A newer sign-in click already owns the loopback, so this (older)
       *  invocation bound nothing and released anything it held. The caller
       *  treats it as a benign supersession — no error, no session. */
      status: "superseded";
    }
  | {
      /** The requested `exactPort` is held by a foreign process (only returned
       *  when `exactPort` was given). The GCIP-brokered caller re-mints its
       *  authorize URL for the next candidate port and asks again. */
      status: "portBusy";
    };

/** Start a one-shot localhost listener for the OAuth sign-in redirect. Keeps
 * desktop sign-in entirely on the user's machine — no website relay, no
 * custom-scheme "open app?" dialog. `expectedState` is the CSRF `state` this
 * attempt minted: the listener answers a callback carrying any OTHER state with
 * a "stale tab" page and KEEPS LISTENING, so a restored browser tab replaying an
 * old redirect can no longer consume the port this sign-in is waiting on.
 * Resolves `{ status: "superseded" }` when a NEWER click already claimed the
 * loopback (concurrent starts are ordered by when the user clicked, not by which
 * invocation finishes binding first). `exactPort` binds that one port or
 * resolves `{ status: "portBusy" }` — the GCIP-brokered flow mints its
 * authorize URL for a single port up front, so it cannot accept "some other
 * free port". Desktop only; web clients have no local listener and use the
 * firebase-js-sdk popup instead. */
export function osStartOauthLoopback(
  expectedState: string,
  exactPort?: number,
): Promise<OauthLoopbackStart> {
  return invokeNative<OauthLoopbackStart>("start_oauth_loopback", {
    expected_state: expectedState,
    ...(exactPort === undefined ? {} : { exact_port: exactPort }),
  });
}

/** Free a loopback listener's port immediately — called when a sign-in attempt
 * is cancelled (sign-in screen unmount, sign-out) or times out, instead of
 * waiting out the native 300s self-timeout. A no-op unless `attemptId` is still
 * the current listener, so a stale cancel cannot kill the next attempt.
 * Desktop only. */
export function osCancelOauthLoopback(attemptId: number): Promise<void> {
  return invokeNative<void>("cancel_oauth_loopback", { attempt_id: attemptId });
}

/** Bind a one-shot localhost listener for the Codex/OpenAI OAuth redirect. On
 * success the native side emits `codex-oauth://callback` with the raw
 * `code=...&state=...` query string once OpenAI bounces the browser back;
 * rejects with a message string if the port can't be bound. Desktop only, and
 * only used against a REMOTE engine (pi's own 1455 is in the pod, so binding a
 * LOCAL 1455 can't collide) — keeps ChatGPT sign-in zero-code even remotely.
 * Mirrors {@link osStartOauthLoopback} (the GCIP/Google sign-in loopback). */
export function osStartCodexOauthLoopback(): Promise<void> {
  return invokeNative<void>("start_codex_oauth_loopback");
}

/** Run `claude auth login --claudeai` FOR the user on the desktop (zero
 * terminal): the native side spawns the bundled `claude`, which opens the
 * browser and catches its own callback. `handoff: false` (co-located engine)
 * caches into Houston's shared login dir — the same `CLAUDE_CONFIG_DIR` the
 * engine reads. `handoff: true` (remote engine) mints into a separate
 * throwaway handoff dir instead: the credential's refresh-token family will be
 * owned by the gateway alone, so it must never be visible to a co-located
 * engine (HOU-950). Emits `claude-login://url` (the authorize URL, as a
 * fallback for the "didn't open" link) and `claude-login://done`
 * (`{ success, error }`). Rejects only on an up-front spawn failure. */
export function osStartClaudeLogin(handoff: boolean): Promise<void> {
  return invokeNative<void>("start_claude_login", { handoff });
}

/** Relay a pasted authorization code to the in-flight desktop Claude sign-in.
 * The claude.ai approval page shows a code when it cannot hand it to the CLI's
 * local listener automatically (firewalls, strict browsers; common on Windows);
 * the native side writes it to the `claude` child's stdin and the CLI finishes
 * its own exchange — the outcome still arrives via `claude-login://done`.
 * Rejects with the real reason when nothing is in flight or the write fails. */
export function osSubmitClaudeLoginCode(code: string): Promise<void> {
  return invokeNative<void>("submit_claude_login_code", { code });
}

/** Opportunistically finish the in-flight Claude sign-in from the clipboard:
 * the approval page's "Copy code" + returning to Houston is the stuck-hand-off
 * signature, so the native side checks the clipboard for a code-shaped string
 * and, when found, feeds it to the CLI. Resolves true when a code was consumed
 * (completion still arrives via `claude-login://done`), false otherwise (no
 * pending login / no matching clipboard text). Never rejects in practice. */
export function osCompleteClaudeLoginFromClipboard(): Promise<boolean> {
  return invokeNative<boolean>("complete_claude_login_from_clipboard");
}

/** Cancel an in-flight desktop Claude sign-in (kills the `claude` child). The
 * native side then emits `claude-login://done` with `error: null` (a benign
 * dismissal). No-op outside Tauri / when nothing is in flight. */
export function osCancelClaudeLogin(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invokeNative<void>("cancel_claude_login");
}
