import { claudeSecureStorageDirIn } from "../../auth/auth-file";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import type { ClaudeToken } from "./backend";

/**
 * The READ-side mirror of `credentials-file.ts`'s write refusal, at TURN START
 * (HOU-976; the single-rotator + cross-member invariants are spelled out in
 * `credentials-file.ts`'s doc comment). Its
 * mid-turn sibling is `anthropicCredentialStorageDir` below — one guard covers
 * who STARTS a turn, the other who can RESUME it after a 401.
 *
 * Every Claude Agent SDK call pins `CLAUDE_CONFIG_DIR` to the pod-shared
 * `claudeLoginConfigDir()`, which on a managed pod holds the TEAM's cached
 * credential. That is correct for the team scope (and for desktop / self-host,
 * where the dir is the user's own `claude auth login` cache). It is NOT correct
 * for a member acting under a PERSONAL scope with no personal token: with no
 * credential in the env the SDK falls back to that cached credential, so the
 * member's turn would silently run on the TEAM account AND the SDK would
 * self-refresh the team's refresh-token family in place. Anthropic rotates the
 * refresh token on every use and invalidates the previous holder, so that makes
 * the pod a SECOND rotator beside the gateway (trap #4) on top of leaking one
 * account's usage across members (trap #6).
 *
 * A personal token PRESENT is fine and proceeds: an env credential OUTRANKS the
 * config-dir credential inside the SDK (trap #3), and personal Anthropic is
 * deliberately served access-only per turn.
 *
 * The message MUST start with `No provider connected.` — that sentinel is what
 * `ai/provider-error.ts` (`NO_CREDENTIALS_PATTERNS`) and `session/chat.ts` match
 * to render the typed `unauthenticated` / `no_credentials` reconnect card with
 * the undelivered prompt, instead of a generic `unknown` error.
 */
export function assertAnthropicScopeCredential(
  token: ClaudeToken | undefined,
): void {
  if (token) return;
  if (!isPersonalScope(currentCredentialScope().key)) return;
  throw new Error(
    "No provider connected. Your Anthropic account is not connected to this space yet. Connect it to keep chatting on Claude.",
  );
}

/**
 * WHERE the SDK subprocess may look for a cached Claude credential — the
 * read-side guard for MID-TURN 401 RECOVERY, and the reason a personal turn
 * cannot silently finish on the team account.
 *
 * `assertAnthropicScopeCredential` above only settles who STARTS the turn. A
 * personal Anthropic credential is served ACCESS-ONLY per turn, so it can expire
 * while the turn is still running; the CLI then runs its own 401 recovery, which
 * RE-READS its credential store and adopts whatever access token it finds there
 * (`<dir>/.credentials.json` on Linux, the dir-scoped Keychain item on macOS).
 * That store is normally the pod-shared claude-login dir, i.e. the TEAM's
 * credential — so without this guard the member's turn would continue, with no
 * message and no card, billing and reading as the team account (trap #6).
 *
 * The SDK's `getOAuthToken` callback is NOT a usable guard for this. Three
 * independent reasons, all read out of the Claude Code build the pinned SDK
 * spawns (2.1.201, bundled in `@anthropic-ai/claude-agent-sdk` 0.3.201):
 *  1. the CLI only registers the callback when `CLAUDE_CODE_ENTRYPOINT` is one of
 *     `claude-desktop` / `local-agent` / `claude-vscode`; the SDK pins ours to
 *     `sdk-ts`, so it is never wired up;
 *  2. it is skipped entirely when the stored credential carries a refresh token
 *     (the CLI refreshes that family in place instead — trap #4);
 *  3. even when it does run it merely PRECEDES the disk read; returning null
 *     falls straight through to it (`tengu_oauth_401_recovered_from_disk`).
 * So the only real lever is the store's LOCATION. `CLAUDE_SECURESTORAGE_CONFIG_DIR`
 * moves the CLI's credential store — the file AND the Keychain service name,
 * which is hashed from this dir — on its own, WITHOUT moving anything else that
 * lives in `CLAUDE_CONFIG_DIR`. That split is the whole point: the shared config
 * dir keeps owning the `projects/` transcript tree, so resume, the sessions store
 * and cross-member conversation continuity stay exactly as they are, and only the
 * credential lookup is isolated. A personal turn's recovery then finds nothing,
 * the 401 stands, and the turn surfaces the honest typed auth error.
 *
 * Returns undefined for the TEAM scope (desktop, self-host, every pre-HOU-976
 * request): no override is set, so that subprocess env is byte-identical to
 * before this guard existed — and the credential in the login dir is that
 * identity's OWN, which is exactly what it should read.
 */
export function anthropicCredentialStorageDir(
  dataDir: string | undefined,
): string | undefined {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return undefined;
  // A personal scope with no data dir to isolate into must FAIL, never quietly
  // inherit the shared store: that silent inheritance is the exact bug this
  // guard exists to close. Reachable only if a new SDK call site forgets to
  // thread its data dir through.
  if (!dataDir)
    throw new Error(
      "cannot isolate the Claude credential store for a personal scope: no data dir was given, and falling back to the pod-shared login dir would run this turn on the team credential",
    );
  return claudeSecureStorageDirIn(dataDir, key);
}
