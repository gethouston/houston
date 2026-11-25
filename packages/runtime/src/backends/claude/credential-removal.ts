import { existsSync, rmSync } from "node:fs";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { spawnClaudeLogout } from "./auth-cli";
import { resetAnthropicCredentialCache } from "./credential-probe-cache";
import { claudeCredentialsFile } from "./paths";

// WHY: SDK resumes from the materialized file if only auth.json goes; reset the probe only after removal. ADR-0009
export function clearGhostClaudeCredential(): boolean {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  const path = claudeCredentialsFile();
  if (!existsSync(path)) return false;
  try {
    rmSync(path, { force: true });
  } catch (err) {
    console.warn(
      `[claude] could not remove the ghost materialized credential at ${path}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
  console.log(
    "[claude] removed ghost materialized credential: the central store no longer holds an anthropic credential for this workspace",
  );
  resetAnthropicCredentialCache(false);
  return true;
}

export async function logoutAnthropicCredential(): Promise<void> {
  try {
    await spawnClaudeLogout();
  } finally {
    try {
      rmSync(claudeCredentialsFile(), { force: true });
    } catch {}
    resetAnthropicCredentialCache(false);
  }
}
