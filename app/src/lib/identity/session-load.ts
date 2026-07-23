// Pure, storage-agnostic orchestration of a session load. It turns a raw
// `ReadResult` into a `SessionLoadState`, decides whether to broadcast, and
// drives the once-per-run keychain ACL rebind — all through injected seams so
// it is unit-testable under `node:test` without Tauri (mirrors oauth-attempt.ts).
// session-store.ts binds the real keychain/browser adapter into it.

import { identityLog } from "./log.ts";
import { deserializeSession, type Session } from "./session.ts";
import type { ReadResult } from "./session-storage-kv.ts";

/**
 * The outcome of reading the persisted session, keeping a storage READ FAULT
 * distinct from a real signed-out. `unavailable` must never be collapsed to
 * `null` at the UI layer — that is exactly the spurious-logout bug.
 */
export type SessionLoadState =
  | { kind: "session"; session: Session }
  | { kind: "none" }
  | { kind: "unavailable"; error: string };

export interface SessionLoadDeps {
  /** Read the persisted blob (present/absent) or a read FAULT. */
  read: () => Promise<ReadResult>;
  /** Broadcast the resolved session to subscribers. Called ONLY on a
   *  non-fault load — a `null` broadcast on a fault would flip every
   *  subscriber to signed-out. */
  notify: (session: Session | null) => void;
  /** Whether this is desktop keychain mode (gates the ACL rebind write). */
  keychainMode: boolean;
  /** Re-save the exact blob to rebind the macOS keychain item's ACL to the
   *  current code signature. Its failure is swallowed inside the loader. */
  rewrite: (blob: string) => Promise<void>;
  /** The current auth epoch (`sessionEpoch`). Captured around the rebind write
   *  so a sign-out racing it can be compensated, mirroring refresh.ts. */
  epoch: () => number;
  /** Remove the persisted blob — the compensation when a sign-out raced the
   *  rebind write, so the rebind can never resurrect a signed-out session. */
  remove: () => Promise<void>;
}

/**
 * Build a session loader closing over a once-per-run rebind flag. Each call
 * reads storage and returns a `SessionLoadState`; on the FIRST successful
 * keychain read of an existing blob it re-saves that blob so the keychain
 * item's ACL rebinds to the current code signature — the permanent fix for the
 * "logged out after update" logout (an auto-update changes the signature and
 * the old ACL entry then rejects reads). The rebind is maintenance only: its
 * failure is logged, never thrown, and never changes the state we return.
 */
export function createSessionLoader(
  deps: SessionLoadDeps,
): () => Promise<SessionLoadState> {
  let rebound = false;

  async function rebindAcl(blob: string): Promise<void> {
    if (rebound || !deps.keychainMode) return;
    rebound = true;
    const epochAtWrite = deps.epoch();
    try {
      await deps.rewrite(blob);
      if (deps.epoch() !== epochAtWrite) {
        // A sign-out (clearSession) landed while the maintenance write was in
        // flight; re-clear so the rebind can never resurrect a signed-out
        // session on the next boot.
        await deps.remove();
      }
    } catch (e) {
      identityLog(
        "error",
        `keychain ACL rebind write failed (session still valid): ${String(e)}`,
        "identity/session-store",
      );
    }
  }

  return async function load(): Promise<SessionLoadState> {
    const read = await deps.read();
    if (!read.ok) {
      // A read FAULT is NOT a signed-out user. Do NOT notify — a null
      // broadcast would flip every subscriber to signed-out and drop the user
      // on the sign-in screen. Log it once here and report `unavailable` so
      // the UI shows a retryable storage-error state instead.
      identityLog(
        "error",
        `session storage unavailable (read fault): ${read.error}`,
        "identity/session-store",
      );
      return { kind: "unavailable", error: read.error };
    }
    const session = deserializeSession(read.value);
    deps.notify(session);
    // Fire-and-forget: the rebind is maintenance whose outcome never changes
    // the returned state, so boot must not wait on a keychain WRITE (a hung
    // write would otherwise pin the splash). Its errors are handled inside.
    if (session && read.value) void rebindAcl(read.value);
    return session ? { kind: "session", session } : { kind: "none" };
  };
}
