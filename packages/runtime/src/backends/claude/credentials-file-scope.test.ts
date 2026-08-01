import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import {
  anthropicCredentialCached,
  resetAnthropicCredentialCache,
} from "./credential-status";
import { writeClaudeOAuthCredentialFile } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

/**
 * The pod-shared Claude login dir is TEAM material (HOU-976 §2.6.5, and
 * knowledge-base/anthropic-credentials.md trap #4): one file per pod, read by
 * every member's SDK subprocess and self-refreshed in place. A MEMBER's
 * credential must never reach it — that would both hand their refresh-token
 * family to the rest of the space and create a second rotator for it.
 */

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };

const CRED = {
  accessToken: "sk-ant-oat-access",
  refreshToken: "sk-ant-ort-refresh",
  expiresAt: 1_800_000_000_000,
  scopes: ["user:inference"],
  subscriptionType: "max",
};

afterEach(() => resetAnthropicCredentialCache(false));

test("a personal scope REFUSES to materialize the pod-shared Claude credential file", () => {
  const dir = mkdtempSync(join(tmpdir(), "claude-login-scope-"));
  expect(() =>
    runWithActingContext(alice, () =>
      writeClaudeOAuthCredentialFile(dir, CRED),
    ),
  ).toThrow(/refusing to materialize a personal Anthropic credential/);
  // Loud refusal, and nothing on disk: not even a half-written tmp file.
  expect(existsSync(dir)).toBe(true);
  expect(existsSync(claudeCredentialsFile(dir))).toBe(false);
  expect(existsSync(`${claudeCredentialsFile(dir)}.tmp`)).toBe(false);
});

test("the team scope still materializes it verbatim (desktop push, unchanged)", () => {
  const dir = mkdtempSync(join(tmpdir(), "claude-login-scope-"));
  writeClaudeOAuthCredentialFile(dir, CRED);
  expect(JSON.parse(readFileSync(claudeCredentialsFile(dir), "utf8"))).toEqual({
    claudeAiOauth: CRED,
  });
});

test("a personal scope never reads the shared login dir as its own connection", () => {
  // The shared-dir probe says "logged in" — that is the TEAM's anthropic
  // account. A member's status must come from their own credential alone.
  resetAnthropicCredentialCache(true);
  expect(anthropicCredentialCached()).toBe(true);
  expect(runWithActingContext(alice, () => anthropicCredentialCached())).toBe(
    false,
  );
});
