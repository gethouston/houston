import { parseClaudeOAuthEnvelope } from "@houston/runtime-client";
import { storeAnthropicOauth } from "../auth/anthropic-oauth-store";
import { serveModeOn } from "../auth/serve";
import { refreshAnthropicCredential } from "../backends/claude/credential-status";
import { writeClaudeOAuthCredentialFile } from "../backends/claude/credentials-file";
import { claudeLoginConfigDir } from "../backends/claude/paths";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * Materialize a desktop-pushed Claude subscription OAuth credential (host→pod)
 * into BOTH sinks the SDK can read from, so a turn authenticates on every OS:
 *
 *  - `<CLAUDE_CONFIG_DIR>/.credentials.json` — the SDK's + `claude auth status`'
 *    source of truth on Linux (the hosted pod), and what the SDK self-refreshes
 *    in place there. The dir is WORKSPACE-SHARED, so this sink is what carries
 *    the push to EVERY agent's runtime, not just this one.
 *  - the pi auth store (`auth.json` `oauth` entry), private to THIS runtime.
 *
 * Both sinks are resolved into the SDK subprocess as `CLAUDE_CODE_OAUTH_TOKEN`
 * (read-token.ts → claude-env.ts), store first. The env token is what makes the
 * push land on a macOS/Windows engine at all: there the SDK reads credentials
 * from the OS keychain scoped to `CLAUDE_CONFIG_DIR`, never from the pushed
 * file, so a push the runtime does not lift into the env is invisible and every
 * turn 401s "Not logged in". The env token also outranks both file and keychain
 * on all three OSes, so one code path authenticates uniformly.
 *
 * Desktop/self-host keeps the full credential so its holder self-refreshes; serve
 * mode strips the refresh token from BOTH sinks so the gateway remains the
 * family's single rotator (the auth.json entry's empty refresh is masked by the
 * empty-refresh guard, so pi never rotates it, and the per-turn served token
 * overwrites it anyway). The body is the pinned CLI envelope, validated STRICTLY
 * — a malformed push is a clear 400 (the desktop falls back to paste), a
 * materialization failure a 500. On success the connected signal is warmed so
 * status flips immediately. The token is never logged.
 */
export async function handleClaudeOAuthCredential(ctx: RouteContext) {
  const parsed = parseClaudeOAuthEnvelope(
    await readJson(ctx.req).catch(() => ({})),
  );
  if (!parsed.ok) {
    json(ctx.res, 400, { error: parsed.error });
    return;
  }
  // ONE serve transform feeds both sinks: full credential off serve mode,
  // access-only (refresh stripped) on a managed pod.
  const cred = serveModeOn()
    ? { ...parsed.value, refreshToken: "" }
    : parsed.value;
  try {
    writeClaudeOAuthCredentialFile(claudeLoginConfigDir(), cred);
    storeAnthropicOauth({
      access: cred.accessToken,
      refresh: cred.refreshToken ?? "",
      expires: cred.expiresAt ?? 0,
    });
  } catch (e) {
    json(ctx.res, 500, {
      error: `could not materialize the Claude credential: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  // Warm the shared-dir credential probe so `configured` / `claude auth status`
  // flips connected on the very next poll instead of after the cache TTL.
  await refreshAnthropicCredential(undefined, { force: true });
  json(ctx.res, 200, { ok: true });
}
