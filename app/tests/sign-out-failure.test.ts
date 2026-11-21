import assert from "node:assert/strict";
import { test } from "node:test";
import { IdentityError } from "../src/lib/identity/errors.ts";
import { signOutFailure } from "../src/lib/sign-out-failure.ts";

test("a clean sign-out reports nothing", () => {
  assert.equal(signOutFailure(undefined, undefined), null);
});

test("a failed session clear reports session_clear_failed", () => {
  const err = signOutFailure(new Error("keychain denied"), undefined);
  assert.ok(err instanceof IdentityError);
  assert.equal(err.code, "session_clear_failed");
});

test("a failed local-data wipe reports its OWN code, not session_clear_failed", () => {
  const err = signOutFailure(undefined, new Error("indexedDB blew up"));
  assert.ok(err instanceof IdentityError);
  assert.equal(err.code, "local_data_clear_failed");
});

test("when both fail, the surviving login wins the report", () => {
  const err = signOutFailure(new Error("keychain"), new Error("idb"));
  assert.ok(err instanceof IdentityError);
  assert.equal(err.code, "session_clear_failed");
});

test("an already-typed identity failure is passed through unchanged", () => {
  const typed = new IdentityError("session_clear_failed");
  assert.equal(signOutFailure(typed, undefined), typed);
});
