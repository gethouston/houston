import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { atomicTempPath } from "@houston/protocol";
import {
  type ClaudeOAuthCredential,
  parseClaudeOAuthEnvelope,
} from "@houston/runtime-client";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { claudeCredentialsFile } from "./paths";

export function writeClaudeOAuthCredentialFile(
  configDir: string,
  cred: ClaudeOAuthCredential,
): void {
  if (isPersonalScope(currentCredentialScope().key))
    throw new Error(
      "refusing to materialize a personal Anthropic credential into the pod-shared Claude login dir: it would be readable by every other member of this space and would create a second refresh-token rotator",
    );
  mkdirSync(configDir, { recursive: true });
  const path = claudeCredentialsFile(configDir);
  const tmp = atomicTempPath(path);
  writeFileSync(tmp, JSON.stringify({ claudeAiOauth: cred }), { mode: 0o600 });
  renameSync(tmp, path);
}

export function claudeOAuthCredentialUsable(
  cred: ClaudeOAuthCredential,
  now: number = Date.now(),
): boolean {
  if (cred.refreshToken) return true;
  const expires = cred.expiresAt ?? 0;
  return expires <= 0 || expires > now;
}

export function readClaudeOAuthCredentialFile(
  path: string,
): ClaudeOAuthCredential | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = parseClaudeOAuthEnvelope(body);
  return parsed.ok ? parsed.value : undefined;
}

export function claudeCredentialFileUsable(
  path: string,
  now: number = Date.now(),
): boolean {
  const cred = readClaudeOAuthCredentialFile(path);
  return cred !== undefined && claudeOAuthCredentialUsable(cred, now);
}
