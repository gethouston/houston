import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { claudeCredentialsFile } from "./paths";

/**
 * Materialize a pushed Claude subscription OAuth credential as the CLI's own
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` — the exact file the Claude Agent SDK
 * and `claude auth status` read on Linux (the hosted pod). Written verbatim in
 * the CLI envelope (`{claudeAiOauth:{…}}`) so the SDK can self-refresh from the
 * refresh token in place.
 *
 * Role after the connect-once serve landed: the file is the pod's IMMEDIATE
 * connected signal at push time and the FALLBACK credential when no served
 * token is available (control plane briefly unreachable, or it can't refresh
 * anthropic yet). Steady-state on a managed pod, the per-turn served access
 * token rides `CLAUDE_CODE_OAUTH_TOKEN` and OUTRANKS this file inside the SDK
 * (see backends/claude/read-token.ts and knowledge-base/
 * anthropic-credentials.md) — which is exactly why the host must never serve
 * a stale anthropic token (routes/credential.ts guards it).
 *
 * Atomic (tmp + rename) at mode 0600 so a concurrent reader never sees a
 * half-written file and the token is owner-only on disk. The refresh token in
 * this file stays on the single-tenant, network-policied pod — a documented,
 * EXPLICITLY scoped departure from Gate #2 (see cloud/INTEGRATION.md); it is
 * never written into the multi-tenant per-turn Cloud Run process, which keeps
 * Anthropic off there.
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
