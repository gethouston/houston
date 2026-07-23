import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import {
  claudeCredentialFileUsable,
  claudeOAuthCredentialUsable,
  writeClaudeOAuthCredentialFile,
} from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

const cred = {
  accessToken: "sk-ant-oat-access",
  refreshToken: "sk-ant-ort-refresh",
  expiresAt: 1_800_000_000_000,
  scopes: ["user:inference", "user:profile"],
  subscriptionType: "max",
};

test("writes the exact CLI envelope to <configDir>/.credentials.json at 0600", () => {
  // A NESTED, not-yet-created dir → the writer must mkdir -p it.
  const configDir = join(
    mkdtempSync(join(tmpdir(), "claude-creds-")),
    "claude-login",
  );
  writeClaudeOAuthCredentialFile(configDir, cred);

  const path = claudeCredentialsFile(configDir);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
    claudeAiOauth: cred,
  });
  // Owner-only on disk (the token must not be group/other readable).
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("overwrites in place (a re-push replaces the credential)", () => {
  const configDir = join(
    mkdtempSync(join(tmpdir(), "claude-creds-")),
    "claude-login",
  );
  writeClaudeOAuthCredentialFile(configDir, cred);
  const next = { ...cred, accessToken: "sk-ant-oat-rotated" };
  writeClaudeOAuthCredentialFile(configDir, next);

  expect(
    JSON.parse(readFileSync(claudeCredentialsFile(configDir), "utf8")),
  ).toEqual({ claudeAiOauth: next });
});

const NOW = 1_784_000_000_000;

test("claudeOAuthCredentialUsable: a refresh token makes the credential self-healing", () => {
  expect(
    claudeOAuthCredentialUsable(
      { accessToken: "at", refreshToken: "rt", expiresAt: NOW - 1 },
      NOW,
    ),
  ).toBe(true);
});

test("claudeOAuthCredentialUsable: without a refresh token, expiry decides", () => {
  expect(
    claudeOAuthCredentialUsable(
      { accessToken: "at", expiresAt: NOW + 60_000 },
      NOW,
    ),
  ).toBe(true);
  // The stale materialized file that showed "Connected" while the SDK said
  // "Not logged in": expired access token, nothing to refresh with.
  expect(
    claudeOAuthCredentialUsable({ accessToken: "at", expiresAt: NOW - 1 }, NOW),
  ).toBe(false);
  // No expiry recorded → usable (mirrors read-token.ts's expires=0 rule).
  expect(claudeOAuthCredentialUsable({ accessToken: "at" }, NOW)).toBe(true);
});

function fileWith(contents: string): string {
  const path = join(
    mkdtempSync(join(tmpdir(), "claude-credfile-")),
    "claude-login",
    ".credentials.json",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

test("claudeCredentialFileUsable: absent file → false (defer to the probe)", () => {
  expect(claudeCredentialFileUsable("/nonexistent/.credentials.json")).toBe(
    false,
  );
});

test("claudeCredentialFileUsable: corrupt / non-envelope contents → false", () => {
  expect(claudeCredentialFileUsable(fileWith("not json"), NOW)).toBe(false);
  expect(claudeCredentialFileUsable(fileWith("{}"), NOW)).toBe(false);
});

test("claudeCredentialFileUsable: judges the envelope, not the file's existence", () => {
  const dead = fileWith(
    JSON.stringify({
      claudeAiOauth: { accessToken: "at", expiresAt: NOW - 1 },
    }),
  );
  expect(claudeCredentialFileUsable(dead, NOW)).toBe(false);
  const alive = fileWith(
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: NOW - 1,
      },
    }),
  );
  expect(claudeCredentialFileUsable(alive, NOW)).toBe(true);
});
