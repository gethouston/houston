import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  emitAuthError,
  onAuthError,
  resetAuthErrorBus,
} from "../src/lib/auth-error-bus.ts";
import type { IdentityErrorCode } from "../src/lib/identity/errors.ts";

// The bus is the ONLY surface for auth failures that have no inline home: post
// hand-off OAuth errors and, critically, a sign-out whose keychain clear failed.
// That last one is emitted while the sign-in screen is not mounted yet — it
// mounts BECAUSE of the sign-out — so an unheard emit must not be dropped.

beforeEach(() => resetAuthErrorBus());

test("broadcasts to every live subscriber", () => {
  const a: IdentityErrorCode[] = [];
  const b: IdentityErrorCode[] = [];
  const unsubA = onAuthError((c) => a.push(c));
  const unsubB = onAuthError((c) => b.push(c));
  emitAuthError("network");
  unsubA();
  unsubB();
  assert.deepEqual(a, ["network"]);
  assert.deepEqual(b, ["network"]);
});

test("an unsubscribed listener stops receiving", () => {
  const seen: IdentityErrorCode[] = [];
  onAuthError((c) => seen.push(c))();
  emitAuthError("network");
  assert.deepEqual(seen, []);
});

test("holds an unheard error for the surface that mounts next", () => {
  // `signOut()` emits before the sign-in screen exists. Without the hold, the
  // failure would reach nobody and the user would silently stay signed in on
  // the next launch with no explanation.
  emitAuthError("session_clear_failed");
  const seen: IdentityErrorCode[] = [];
  onAuthError((c) => seen.push(c))();
  assert.deepEqual(seen, ["session_clear_failed"]);
});

test("a held error is delivered once, to the first subscriber only", () => {
  emitAuthError("session_clear_failed");
  const first: IdentityErrorCode[] = [];
  const second: IdentityErrorCode[] = [];
  onAuthError((c) => first.push(c))();
  onAuthError((c) => second.push(c))();
  assert.deepEqual(first, ["session_clear_failed"]);
  assert.deepEqual(second, [], "the held error was replayed twice");
});

test("nothing is held while a surface is already listening", () => {
  const live: IdentityErrorCode[] = [];
  const unsub = onAuthError((c) => live.push(c));
  emitAuthError("otp_invalid_code");
  unsub();
  const late: IdentityErrorCode[] = [];
  onAuthError((c) => late.push(c))();
  assert.deepEqual(live, ["otp_invalid_code"]);
  assert.deepEqual(late, [], "a delivered error was also held");
});

test("a throwing subscriber does not break the broadcast", () => {
  const seen: IdentityErrorCode[] = [];
  const unsubA = onAuthError(() => {
    throw new Error("render blew up");
  });
  const unsubB = onAuthError((c) => seen.push(c));
  emitAuthError("network");
  unsubA();
  unsubB();
  assert.deepEqual(seen, ["network"]);
});
