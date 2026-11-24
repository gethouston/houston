import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { LocalModelTransportContext } from "../ai/local-model-transport";
import type { TurnCredentialChannel } from "../auth/turn-credential-channel";
import { decodeActingAuthor } from "./attribution";

export interface ActingContext {
  localModelTransport?: LocalModelTransportContext;
  actingAs?: string;
  actingUser?: string;
  verifiedOwner?: string;
  credentialScopeKey?: string;
  authPath?: string;
  credentialChannel?: TurnCredentialChannel;
}

export const TEAM_CREDENTIAL_SCOPE = "team";

export interface CredentialScope {
  key: string;
  actingAs?: string;
}

export function credentialScopeKeyFor(actingAs: string | undefined): string {
  if (!actingAs) return TEAM_CREDENTIAL_SCOPE;
  const sub = decodeActingAuthor(actingAs)?.userId;
  if (sub) return `u:${sub}`;
  const digest = createHash("sha256").update(actingAs).digest("hex");
  console.warn(
    "[acting] acting-as token payload is unreadable; isolating its credential scope instead of falling back to the team credential",
  );
  return `u:unreadable-${digest.slice(0, 16)}`;
}

export function isPersonalScope(key: string): boolean {
  return key !== TEAM_CREDENTIAL_SCOPE;
}

const store = new AsyncLocalStorage<ActingContext>();

export function runWithActingContext<T>(
  ctx: ActingContext | undefined,
  fn: () => T,
): T {
  if (
    !ctx ||
    (!ctx.actingAs &&
      !ctx.actingUser &&
      !ctx.verifiedOwner &&
      !ctx.credentialScopeKey &&
      !ctx.authPath &&
      !ctx.localModelTransport &&
      !ctx.credentialChannel)
  )
    return fn();
  return store.run(
    {
      ...ctx,
      credentialScopeKey:
        ctx.credentialScopeKey ??
        (ctx.actingAs ? credentialScopeKeyFor(ctx.actingAs) : undefined),
    },
    fn,
  );
}

export function currentActingContext(): ActingContext | undefined {
  return store.getStore();
}

export function currentCredentialScope(): CredentialScope {
  const ctx = store.getStore();
  if (!ctx?.actingAs && !ctx?.credentialScopeKey)
    return { key: TEAM_CREDENTIAL_SCOPE };
  return {
    key: ctx.credentialScopeKey ?? credentialScopeKeyFor(ctx.actingAs),
    ...(ctx.actingAs ? { actingAs: ctx.actingAs } : {}),
  };
}

export function actingFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}): ActingContext | undefined {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const actingAs = one(headers["x-houston-acting-as"]);
  const actingUser = one(headers["x-houston-acting-user"]);
  return actingAs || actingUser ? { actingAs, actingUser } : undefined;
}
