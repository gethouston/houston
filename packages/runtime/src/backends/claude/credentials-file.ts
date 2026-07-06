import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { claudeCredentialsFile } from "./paths";

/**
 * Materialize a pushed Claude subscription OAuth credential as the CLI's own
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` — the exact file the Claude Agent SDK
 * and `claude auth status` read on Linux (the hosted pod). Written verbatim in
 * the CLI envelope (`{claudeAiOauth:{…}}`) so the SDK self-refreshes from the
 * refresh token in place; NO central refresh is needed and the stale-token bug
 * is gone.
 *
 * Atomic (tmp + rename) at mode 0600 so a concurrent reader never sees a
 * half-written file and the token is owner-only on disk. The refresh token stays
 * HERE on the single-tenant, network-policied pod — a documented, EXPLICITLY
 * scoped departure from Gate #2 (see cloud/INTEGRATION.md); it is never written
 * into the multi-tenant per-turn Cloud Run process, which keeps Anthropic off.
 */
export function writeClaudeOAuthCredentialFile(
  configDir: string,
  cred: ClaudeOAuthCredential,
): void {
  mkdirSync(configDir, { recursive: true });
  const path = claudeCredentialsFile(configDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ claudeAiOauth: cred }), { mode: 0o600 });
  renameSync(tmp, path);
}
