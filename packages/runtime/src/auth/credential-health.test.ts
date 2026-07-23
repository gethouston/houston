import { afterEach, expect, test } from "vitest";
import {
  authFailureActive,
  clearAuthFailure,
  noteAuthFailure,
  resetAuthFailures,
} from "./credential-health";

// Fingerprints are injected everywhere, so these tests never touch auth.json
// or the Claude credential file — the module's IO is exercised implicitly by
// the fact that production callers omit the parameter.

afterEach(() => resetAuthFailures());

test("nothing marked → no failure, no IO needed", () => {
  expect(authFailureActive("anthropic", "fp-a")).toBe(false);
});

test("a marked credential reads as failed while it is still in place", () => {
  noteAuthFailure("anthropic", "fp-a");
  expect(authFailureActive("anthropic", "fp-a")).toBe(true);
  // Still the same credential on a later poll — still failed.
  expect(authFailureActive("anthropic", "fp-a")).toBe(true);
});

test("a credential change auto-heals the mark (re-login, fresh served token, pasted key)", () => {
  noteAuthFailure("anthropic", "fp-dead");
  expect(authFailureActive("anthropic", "fp-fresh")).toBe(false);
  // The heal is permanent: even the old fingerprint no longer reads failed
  // (the mark was deleted, not merely bypassed).
  expect(authFailureActive("anthropic", "fp-dead")).toBe(false);
});

test("a serve loop re-applying the SAME dead token does not heal the mark", () => {
  // applyServedCredential rewrites auth.json with identical bytes → identical
  // fingerprint → the provider must stay disconnected (no status flapping).
  noteAuthFailure("openai-codex", "fp-dead");
  expect(authFailureActive("openai-codex", "fp-dead")).toBe(true);
});

test("a clean turn clears the mark explicitly (the Keychain re-login no fingerprint can see)", () => {
  noteAuthFailure("anthropic", "fp-a");
  clearAuthFailure("anthropic");
  expect(authFailureActive("anthropic", "fp-a")).toBe(false);
});

test("marks are per provider", () => {
  noteAuthFailure("anthropic", "fp-a");
  expect(authFailureActive("openai-codex", "fp-a")).toBe(false);
});
