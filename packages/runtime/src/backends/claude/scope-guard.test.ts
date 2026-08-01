import { expect, test } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import type { ClaudeToken } from "./backend";
import { assertAnthropicScopeCredential } from "./scope-guard";

/**
 * The SDK always gets the POD-SHARED `CLAUDE_CONFIG_DIR`, so "no token in the
 * env" means "authenticate from whatever credential is cached in that dir". For
 * a member acting under a personal scope that credential is the TEAM's, and the
 * SDK self-refreshes it (knowledge-base/anthropic-credentials.md traps #4/#6).
 */
function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };
const oauth: ClaudeToken = { kind: "oauth-token", value: "sk-ant-oat01-x" };
const apiKey: ClaudeToken = { kind: "api-key", value: "sk-ant-api03-x" };

test("a personal scope with no personal token throws", () => {
  expect(() =>
    runWithActingContext(alice, () =>
      assertAnthropicScopeCredential(undefined),
    ),
  ).toThrow(/^No provider connected\./);
});

test("the refusal message carries the not-connected sentinel verbatim", () => {
  // The chat surfaces a typed `unauthenticated` / `no_credentials` reconnect card
  // ONLY for messages matching this phrase (ai/provider-error.ts's
  // NO_CREDENTIALS_PATTERNS, session/chat.ts's regex). Reword the prefix and the
  // member gets a generic `unknown` error with no reconnect flow.
  let message = "";
  try {
    runWithActingContext(alice, () =>
      assertAnthropicScopeCredential(undefined),
    );
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  expect(message.startsWith("No provider connected.")).toBe(true);
  // Honest, non-technical copy: names the account, never a file or a config dir.
  expect(message).toContain("Anthropic account");
  expect(message).not.toMatch(/config|dir|file|credentials\.json/i);
});

test("a personal scope with its own OAuth token is a no-op", () => {
  // A served env token outranks the config-dir credential inside the SDK, so the
  // member runs on their own account (trap #3).
  expect(() =>
    runWithActingContext(alice, () => assertAnthropicScopeCredential(oauth)),
  ).not.toThrow();
});

test("a personal scope with its own API key is a no-op", () => {
  expect(() =>
    runWithActingContext(alice, () => assertAnthropicScopeCredential(apiKey)),
  ).not.toThrow();
});

test("the team scope with no token is a no-op (desktop / self-host / pre-HOU-976)", () => {
  // The dir the SDK reads IS this identity's own login cache here. Nothing to
  // refuse, and the guard must not change that path at all.
  expect(() => assertAnthropicScopeCredential(undefined)).not.toThrow();
  expect(() =>
    runWithActingContext({ actingUser: "sub-alice" }, () =>
      assertAnthropicScopeCredential(undefined),
    ),
  ).not.toThrow();
});
