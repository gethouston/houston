import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { decodeActingAuthor } from "./attribution";

/**
 * WHO the current turn is acting as (C2), captured from the host→runtime message
 * request and made available to the integration tools while the turn runs.
 *
 *  - `actingAs`:   the gateway's per-turn acting-as token (a live user drove the
 *                  turn) — forwarded verbatim on `/sandbox/integrations/*`.
 *  - `actingUser`: a routine creator's Supabase `sub` (a fired routine) —
 *                  forwarded so the host pairs it with the pod token upstream.
 *
 * Turn-scoping mechanism + assumption: an `AsyncLocalStorage` whose store is
 * established for the DURATION of `session.prompt()` (see chat.ts `execTurn`).
 * The tool `execute` callbacks run inside that same async context, so they read
 * the correct value with NO process-global mutation — this stays race-free even
 * when two conversations run concurrently in one runtime (a plain module-level
 * "current acting-as" would leak across them). Outside a turn (e.g. unit tests
 * calling a tool directly) the store is undefined, so no header is attached and
 * behavior is unchanged.
 */
export interface ActingContext {
  actingAs?: string;
  actingUser?: string;
  /**
   * WHOSE credentials this subtree resolves — derived from `actingAs` (see
   * `credentialScopeKeyFor`), precomputed here because the credential store
   * resolves it on every `read()` pi makes inside `prepareRequest`.
   */
  credentialScopeKey?: string;
}

/** The credential scope of a request with no acting identity: the shared file. */
export const TEAM_CREDENTIAL_SCOPE = "team";

/** WHOSE credentials the current async subtree resolves. */
export interface CredentialScope {
  /** `"team"`, or `u:<sub>` for a per-member scope. */
  key: string;
  /** The acting-as token to forward when serving this scope's credential. */
  actingAs?: string;
}

/**
 * The credential scope key an acting-as token resolves to.
 *
 * Only `actingAs` (the gateway-SIGNED per-turn token) can select a member's own
 * credentials. `actingUser` deliberately cannot: a fired routine carries the
 * creator's bare sub with no signed identity behind it, so in-pod routines run
 * on the team account (HOU-976 D10).
 */
export function credentialScopeKeyFor(actingAs: string | undefined): string {
  if (!actingAs) return TEAM_CREDENTIAL_SCOPE;
  const sub = decodeActingAuthor(actingAs)?.userId;
  if (sub) return `u:${sub}`;
  // A token whose payload we cannot read is NOT the team: falling back to the
  // shared scope would let a garbled token read the team credential. It gets
  // its own isolated scope, keyed by a DIGEST of the token — this key reaches
  // log lines and file names, so the token itself must never be it. Loud,
  // because it means the gateway sent us something malformed and the request
  // will surface as "not connected".
  const digest = createHash("sha256").update(actingAs).digest("hex");
  console.warn(
    "[acting] acting-as token payload is unreadable; isolating its credential scope instead of falling back to the team credential",
  );
  return `u:unreadable-${digest.slice(0, 16)}`;
}

/** Whether a scope key addresses one member's own credentials. */
export function isPersonalScope(key: string): boolean {
  return key !== TEAM_CREDENTIAL_SCOPE;
}

const store = new AsyncLocalStorage<ActingContext>();

/** Run `fn` with `ctx` as the ambient acting context for its whole async subtree. */
export function runWithActingContext<T>(
  ctx: ActingContext | undefined,
  fn: () => T,
): T {
  // No identity to carry (local single-user, or neither header present): run
  // plainly so the tools see `undefined` and attach nothing.
  if (!ctx || (!ctx.actingAs && !ctx.actingUser)) return fn();
  return store.run(
    { ...ctx, credentialScopeKey: credentialScopeKeyFor(ctx.actingAs) },
    fn,
  );
}

/** The current turn's acting context, or undefined outside a turn. */
export function currentActingContext(): ActingContext | undefined {
  return store.getStore();
}

/**
 * WHOSE credentials the current async subtree must resolve. `{ key: "team" }`
 * outside any acting identity — desktop, self-host, and every pre-HOU-976
 * request — so those paths keep reading the one shared auth.json.
 */
export function currentCredentialScope(): CredentialScope {
  const ctx = store.getStore();
  if (!ctx?.actingAs) return { key: TEAM_CREDENTIAL_SCOPE };
  return {
    key: ctx.credentialScopeKey ?? credentialScopeKeyFor(ctx.actingAs),
    actingAs: ctx.actingAs,
  };
}

/**
 * The C2 acting-as identity carried by a runtime request's headers, or
 * undefined. Read at the transport edge (server.ts wraps EVERY request) so the
 * credential scope, the integration tools and message attribution all see the
 * same identity.
 */
export function actingFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}): ActingContext | undefined {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const actingAs = one(headers["x-houston-acting-as"]);
  const actingUser = one(headers["x-houston-acting-user"]);
  return actingAs || actingUser ? { actingAs, actingUser } : undefined;
}
