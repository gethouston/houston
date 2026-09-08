import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { type ProbeAnswer, spawnStatusProbe } from "./auth-cli";
import {
  type CredentialProbe,
  readCredentialCache,
  refreshAnthropicCredential,
} from "./credential-probe-cache";
import { claudeCredentialFileUsable } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

/**
 * Whether a Claude credential is cached FOR Houston's shared login dir.
 *
 * The desktop browser login (`claude auth login`) caches its credential where
 * only the `claude` binary can read it — the macOS Keychain (no file to stat) or
 * `<dir>/.credentials.json` on Linux — and that lookup is SCOPED BY
 * `CLAUDE_CONFIG_DIR`. So the one reliable, cross-platform "is anthropic
 * connected?" signal is to ask the binary itself (`auth-cli.ts`) and read
 * `loggedIn`. There is no artifact we can stat on macOS.
 *
 * That probe is a subprocess, so we cache its result: `providerConnected`
 * (sync, hit at turn time by `activeProvider`) reads the cache, while
 * `getAuthStatus` (the frontend's poll) live-refreshes it — warming the cache
 * for the sync path. The degraded setup-token fallback stores its token in
 * auth.json instead, and `providerConnected` counts that separately.
 *
 * A probe that fails to ANSWER is NOT a logged-out answer. Treating it as one is
 * what flapped the card to "Connect Anthropic" on a signed-in user, so an
 * unknown answer leaves the cache alone, logs the reason, and backs off instead
 * of re-spawning a subprocess per poll.
 */

export {
  forgetAnthropicCredentialCacheForTest,
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "./credential-probe-cache";
export {
  clearGhostClaudeCredential,
  logoutAnthropicCredential,
} from "./credential-removal";
export type { CredentialProbe, ProbeAnswer };

/**
 * The sync "is anthropic connected?" signal, hit at turn time by
 * `activeProvider`/`providerConnected`.
 *
 * On the POD (Linux) the credential is materialized as a file — a sync read is
 * instant, needs no subprocess, and is correct the moment the file is written.
 * The file must actually be USABLE (`claudeCredentialFileUsable`), not merely
 * present: a stale file whose token expired with no refresh token used to
 * short-circuit this to "connected" — even shadowing a probe that correctly said
 * logged-out — so the AI Models page showed Connected while every turn failed
 * with the reconnect card. macOS-local caches in the Keychain (no file to read),
 * so a missing/dead file falls back to the last probe result.
 *
 * SCOPE (HOU-976): the shared login dir is POD-WIDE — one file, one Keychain
 * entry, serving every member of a team space — so it is the TEAM's credential.
 * A personal scope must not read it as its own: that would report a member
 * "connected" on a credential that is not theirs and then run their turns on
 * it. Under a personal scope the answer comes from that member's own auth file
 * alone (`providerConnected`).
 */
export function anthropicCredentialCached(): boolean {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  if (claudeCredentialFileUsable(claudeCredentialsFile())) return true;
  return readCredentialCache() ?? false;
}

/**
 * The same signal WITH its unknown state, for the callers that must not read
 * "we haven't asked yet" as "logged out": `true`/`false` only from a settled
 * answer, `undefined` while no probe has answered.
 *
 * The sync signal above collapses the two, which a STATUS row survives (the
 * next poll corrects it) but a TURN gate does not: for as long as the first
 * probe runs (`auth-cli`'s 10s execFile timeout) an anthropic-pinned turn was
 * refused as not-connected and its prompt never reached the model. So the gate
 * awaits the first answer here instead — bounded by that same timeout, joining
 * the boot prime's in-flight probe rather than spawning a second one, and
 * paying NOTHING once an answer (or a usable materialized file) exists.
 */
export async function anthropicCredentialSettled(
  probe: CredentialProbe = spawnStatusProbe,
): Promise<boolean | undefined> {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  if (claudeCredentialFileUsable(claudeCredentialsFile())) return true;
  const known = readCredentialCache();
  if (known !== undefined) return known;
  await refreshAnthropicCredential(probe);
  // Still `undefined` when the probe could not answer — an unanswerable probe
  // is not a sign-out, so the caller must decide without inventing one.
  return readCredentialCache();
}

/** Fire-and-forget cache warm at runtime boot (server mode). */
export function primeAnthropicCredential(): void {
  void refreshAnthropicCredential();
}
