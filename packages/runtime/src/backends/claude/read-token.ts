import { accessDigest } from "@houston/protocol/access-digest";
import { ANTHROPIC_TOKEN_PREFIXES } from "../../auth/anthropic-setup-token";
import type { HoustonAuthStore } from "../../auth/credential-store";
import type { ClaudeToken } from "./backend";
import {
  anthropicIsCentrallyServed,
  readSharedLogin,
  type StoredLogin,
  sharedLoginSupersedes,
} from "./shared-login";

/**
 * Resolve the `anthropic` credential into the `ClaudeToken` the Claude Agent SDK
 * backend runs with. Two stored variants map here:
 *
 *  - The setup-token flow stores the pasted value under `anthropic` as pi's
 *    `api_key` variant (see auth/anthropic-setup-token.ts).
 *  - The connect-once serve path (managed cloud) writes pi's `oauth` variant
 *    with a short-TTL ACCESS token and refresh="" (Gate #2) — the control
 *    plane is the single refresher, the pod never holds the refresh token.
 *
 * Either way the SDK consumes the value through env vars, and WHICH var is
 * selected by the token's prefix: a subscription OAuth/setup token
 * (`sk-ant-oat01…`) rides `CLAUDE_CODE_OAUTH_TOKEN`, a console API key
 * (`sk-ant-api03…`) rides `ANTHROPIC_API_KEY`. Mapped here, once, off the SAME
 * prefix list the login validator uses. The env token deliberately outranks
 * whatever `.credentials.json`/Keychain state the config dir carries — a stale
 * materialized file can never shadow a freshly served token.
 *
 * No silent failure: an absent store entry falls through to the rest of the
 * chain (`readAnthropicToken` below) quietly — not connected here is expected —
 * but a STORED value we can't classify (unexpected PiCred variant, or an
 * unrecognized prefix) falls through AND logs the concrete reason, so a
 * bad/corrupt entry surfaces in the logs instead of vanishing.
 *
 * SCOPE (HOU-976): `store.get` resolves the ambient acting identity, so on a
 * shared pod this returns the ACTING member's anthropic token — read inside the
 * turn's async subtree by every caller (conversation-cache, summarize,
 * anonymize). The shared-login-dir fallback below is TEAM-scope only, mirroring
 * the write refusal in `credentials-file.ts`.
 */
const [OAUTH_TOKEN_PREFIX, API_KEY_PREFIX] = ANTHROPIC_TOKEN_PREFIXES;

function classify(value: string): ClaudeToken | undefined {
  if (value.startsWith(OAUTH_TOKEN_PREFIX))
    return { kind: "oauth-token", value };
  if (value.startsWith(API_KEY_PREFIX)) return { kind: "api-key", value };
  console.warn(
    `[claude] stored "anthropic" token has an unrecognized prefix (expected ${OAUTH_TOKEN_PREFIX}… or ${API_KEY_PREFIX}…); refusing to use it`,
  );
  return undefined;
}

/**
 * The anthropic credential this runtime authenticates the SDK with, resolved in
 * strict precedence order:
 *
 *  1. the STORE entry (`auth.json`), when unexpired — the freshest credential
 *     this agent was served or connected with;
 *  2. the SHARED login dir's `.credentials.json`, when unexpired — one login,
 *     every agent (`./shared-login`). It also OUTRANKS link 1 when it is a
 *     provably later login than the stored copy, which is what lets a reconnect
 *     performed against another runtime reach this one: without that, an
 *     unexpired store entry for the account the user just left would be
 *     preferred for hours, failing every turn on an identity or a token that
 *     reconnect superseded. A superseded store entry is DELETED, not merely
 *     skipped — see below. Where the control plane serves anthropic, the store
 *     entry is the live per-turn credential and this link stays a pure
 *     fallback (`sharedLoginSupersedes`).
 *  3. nothing, which hands the turn to the platform's own config-dir mechanism
 *     inside the SDK (the `.credentials.json` it self-refreshes on Linux, the
 *     dir-scoped keychain item on macOS/Windows).
 *
 * Each link falls through to the next on ANY unusable value — expired, empty,
 * malformed, or absent — so a broken credential can never shadow a working one.
 * A PERSONAL credential scope never reaches the shared dir at all (it is the
 * team's), so a member is never moved onto the team account by any of this.
 */
export function readAnthropicToken(
  store: Pick<HoustonAuthStore, "get"> &
    Partial<Pick<HoustonAuthStore, "remove">>,
): ClaudeToken | undefined {
  const stored = readStoredAnthropicToken(store);
  // A served token that EXPIRED is not an absent credential: on a pod the
  // gateway is the authority for, the shared file is a push-time leftover that
  // may belong to another account entirely, so authenticating with it would run
  // the user's turn as someone else. The turn fails instead, and the next sync
  // brings a fresh token.
  if (stored === "expired" && anthropicIsCentrallyServed()) {
    console.warn(
      '[claude] the served "anthropic" access token is expired; refusing the shared login dir, which is not this runtime\'s authority',
    );
    return undefined;
  }
  const shared = readSharedLogin();
  if (!stored || stored === "expired") return shared?.token;
  // An api_key entry (a pasted setup token or console key) is a credential the
  // user chose for THIS runtime and carries no issuance date, so it is never
  // superseded by the shared dir — `supersedable` is null for it.
  if (
    shared &&
    stored.supersedable &&
    sharedLoginSupersedes(shared, stored.supersedable)
  ) {
    // Skipping the superseded entry is not enough: it stays in auth.json and
    // wins again the moment the shared file can no longer PROVE it is newer —
    // the file is rewritten with a shorter-lived token, or removed entirely —
    // silently putting this runtime back on the account the user left. The
    // supersession is a fact about the login, so record it once: drop the dead
    // entry and every later read resolves the login the user actually has.
    //
    // BEST-EFFORT: the drop is a WRITE (auth.json, atomically), and a full or
    // read-only disk must not take the turn down with it — resolving the login
    // the user actually has is the job, and it succeeds either way. Reported,
    // never swallowed: console.error is the runtime's Sentry feed (main.ts).
    // A READ-ONLY caller (the session staleness probe,
    // session/claude-token-guard.ts) passes no `remove`: a probe that answers
    // "is this session's token still current" must not delete a credential on
    // the way. The read the turn itself makes carries the drop.
    try {
      store.remove?.("anthropic");
    } catch (err) {
      console.error(
        '[claude] could not drop the superseded "anthropic" credential; the shared login is used for this turn and the drop is retried on the next read:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return shared.token;
  }
  return stored.token;
}

/**
 * Link 1: the `anthropic` entry in this runtime's own credential store.
 * `"expired"` is distinct from absent - see {@link readAnthropicToken}.
 */
function readStoredAnthropicToken(
  store: Pick<HoustonAuthStore, "get">,
):
  | { token: ClaudeToken; supersedable: StoredLogin | null }
  | "expired"
  | undefined {
  const cred = store.get("anthropic");
  if (!cred) return undefined; // not connected — no credential to read

  if (cred.type === "api_key") {
    // pi ≥0.81 allows a keyless `api_key` entry (provider-env-only, e.g. an
    // AWS profile). Anthropic's setup-token flow always stores a key, so an
    // empty one is a corrupt entry — surface it, don't classify "".
    const key = cred.key?.trim();
    if (!key) {
      console.warn(
        `[claude] stored "anthropic" api_key credential has no key; refusing to use it`,
      );
      return undefined;
    }
    const token = classify(key);
    return token ? { token, supersedable: null } : undefined;
  }
  if (cred.type === "oauth") {
    const access = cred.access?.trim();
    if (!access) {
      console.warn(
        `[claude] stored "anthropic" oauth credential has an empty access token; ignoring it`,
      );
      return undefined;
    }
    // Last line of defense: never hand the SDK an EXPIRED served token. The
    // env token outranks the config dir's self-refreshing credential, so a
    // stale entry that slipped past the host's serve guards (a control plane
    // that can't refresh anthropic yet, an orphaned entry) would shadow a
    // WORKING file/keychain credential. Returning undefined instead hands the
    // turn to the next link of the chain. expires=0 means "no expiry recorded"
    // (a pasted token stored as oauth) and is served as-is.
    if (cred.expires > 0 && cred.expires <= Date.now()) {
      console.warn(
        `[claude] stored "anthropic" oauth access token is expired; falling back to the shared login dir credential`,
      );
      return "expired";
    }
    const token = classify(access);
    if (!token) return undefined;
    // Capture WHICH token the subprocess will run on, digested at spawn
    // preparation: the revoked-token report must name this token, not
    // whatever auth.json holds when a turn later fails (PRODUCT-1319).
    // OAUTH-typed store entries only — mirroring the reporter's oauth gate —
    // so the api_key branch above stays digest-less by design.
    return {
      token: { ...token, accessDigest: accessDigest(access) },
      supersedable: { value: access, expires: cred.expires },
    };
  }

  console.warn(
    `[claude] stored "anthropic" credential is a "${(cred as { type: string }).type}" entry, expected api_key or oauth; ignoring it`,
  );
  return undefined;
}
