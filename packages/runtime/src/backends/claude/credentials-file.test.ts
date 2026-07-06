import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { writeClaudeOAuthCredentialFile } from "./credentials-file";
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
