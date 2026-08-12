import { AsyncLocalStorage } from "node:async_hooks";
import { accessDigest } from "@houston/protocol/access-digest";

/**
 * WHICH access token the current turn's provider requests actually ran on —
 * captured at request preparation, per turn (PRODUCT-1319).
 *
 * The revoked-token report (`report-revoked.ts`) names the token it wants the
 * control plane to compare-and-delete by digest. It used to re-read the
 * mutable auth.json at REPORT time — but the failed turn ran on whatever token
 * was stored at REQUEST time, and a serve sync or user reconnect between the
 * 401 and the report swaps in a healthy replacement. Digesting the file then
 * named the FRESH token, and the gateway's compare-and-delete
 * correctly-but-disastrously destroyed the working credential (feeding a
 * reconnect loop). This capture pins the digest to the token the failed
 * request actually used.
 *
 * Only the DIGEST is ever held — the raw token is hashed at record time and
 * never carried around (same never-ship-the-token rule as the report body).
 *
 * Turn-scoping mechanism + assumption: identical to `session/interaction.ts` —
 * an explicit per-turn holder established via `AsyncLocalStorage` for the
 * duration of `session.prompt()` (exec-turn.ts / turn-session.ts). The
 * credential store's `read()` runs inside pi's `prepareRequest`, i.e. inside
 * that same async subtree, so each concurrent turn records into ITS OWN
 * holder — a module-level "last read" map would let a concurrent turn's
 * fresher read overwrite the failed turn's evidence, re-opening the exact
 * window this exists to close. Outside a turn (login flows, status probes,
 * unit tests) there is no ambient holder and recording is a no-op.
 *
 * Only OAuth ACCESS tokens are recorded (the capture sites enforce this): an
 * api_key has no revocation semantics the report may act on, mirroring the
 * reporter's historical oauth-only gate.
 */
export interface UsedTokenCapture {
  /** Digest `access` NOW and remember it as the token `provider` ran on. */
  record(provider: string, access: string): void;
  /** The recorded digest for `provider`, or undefined when never recorded. */
  digestFor(provider: string): string | undefined;
}

/** A fresh, empty capture — one per turn (the fresh instance IS the reset). */
export function newUsedTokenCapture(): UsedTokenCapture {
  const digests = new Map<string, string>();
  return {
    record(provider, access) {
      digests.set(provider, accessDigest(access));
    },
    digestFor(provider) {
      return digests.get(provider);
    },
  };
}

const store = new AsyncLocalStorage<UsedTokenCapture>();

/** Run `fn` with `capture` as the turn's ambient used-token record. */
export function runWithUsedTokenCapture<T>(
  capture: UsedTokenCapture,
  fn: () => T,
): T {
  return store.run(capture, fn);
}

/**
 * Record into the current turn's capture, if one is ambient. Called by the
 * credential store at pi's request-time read (and after an OAuth refresh, so a
 * mid-turn rotation attributes later requests to the NEW token); a no-op
 * outside a turn.
 */
export function recordUsedToken(provider: string, access: string): void {
  store.getStore()?.record(provider, access);
}

/**
 * The digest of the token the current turn last resolved for `provider`, or
 * undefined outside a turn / before any request read a credential.
 */
export function currentUsedTokenDigest(provider: string): string | undefined {
  return store.getStore()?.digestFor(provider);
}
