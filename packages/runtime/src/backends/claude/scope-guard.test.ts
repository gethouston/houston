import { expect, test } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import type { ClaudeToken } from "./backend";
import { assertAnthropicScopeCredential } from "./scope-guard";

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
  let message = "";
  try {
    runWithActingContext(alice, () =>
      assertAnthropicScopeCredential(undefined),
    );
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  expect(message.startsWith("No provider connected.")).toBe(true);
  expect(message).toContain("Anthropic account");
  expect(message).not.toMatch(/config|dir|file|credentials\.json/i);
});

test("a personal scope with its own OAuth token is a no-op", () => {
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
  expect(() => assertAnthropicScopeCredential(undefined)).not.toThrow();
  expect(() =>
    runWithActingContext({ actingUser: "sub-alice" }, () =>
      assertAnthropicScopeCredential(undefined),
    ),
  ).not.toThrow();
});
