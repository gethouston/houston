/**
 * The account REST calls — the caller's own display profile and personal API
 * keys — over the injected `fetch`.
 *
 * These are gateway-only routes (`/v1/me/profile`, `/v1/keys`): the runtime
 * client is scoped to one agent's sandbox and serves none of them, so the
 * module talks to them through {@link httpRequest} with literal paths, which is
 * also what keeps them visible to the assistant's operation catalog.
 *
 * Nothing is swallowed here: a non-2xx always throws an
 * {@link AccountHttpError} carrying the HTTP `status`, so a `404` from a
 * gateway that predates `/v1/me/profile` reaches the caller and it — not this
 * layer — decides whether that hides a section or is a failure. The `key_limit`
 * 400 of a 20th API key likewise arrives intact for its inline treatment. A
 * `401` additionally fires {@link HttpScope.onUnauthorized}, so a lapsed
 * session token becomes a visible `tokenExpired` signal.
 */

import {
  type HttpScope,
  httpRequest,
  moduleScope,
  type ScopeContext,
  SdkHttpError,
} from "../http";
import type {
  ApiKey,
  ApiKeyCreated,
  EditableProfile,
  EditableProfileUpdate,
} from "./types";

/** A failed account request. `status` is the upstream HTTP status. */
export class AccountHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "AccountHttpError");
  }
}

/** The five account operations the module needs. */
export interface AccountHttp {
  getMyProfile(): Promise<EditableProfile>;
  setMyProfile(update: EditableProfileUpdate): Promise<EditableProfile>;
  listApiKeys(): Promise<ApiKey[]>;
  createApiKey(name: string): Promise<ApiKeyCreated>;
  revokeApiKey(id: string): Promise<void>;
}

/**
 * Reads the user's own name and photo.
 *
 * The caller's OWN editable display profile (name + photo): the EFFECTIVE
 * values the product renders, plus `custom` saying which of them the user set
 * by hand rather than inheriting from Google. A gateway that predates the route
 * answers 404 like any other failure — the caller degrades that to "no profile
 * to edit" (the Settings profile section then never renders) so a pre-feature
 * host stays byte-identical.
 * @assistant group:settings
 */
export async function getMyProfile(scope: HttpScope): Promise<EditableProfile> {
  const res = await httpRequest(scope, "/v1/me/profile");
  return (await res.json()) as EditableProfile;
}

/**
 * Updates the user's own name or photo.
 *
 * Update the caller's own display profile. Per key: a string sets the
 * override, `null` clears it back to the identity provider's value, an omitted
 * key leaves that field untouched. Answers the full effective profile so the
 * caller repaints from the host's truth. Deliberately WITHOUT the 404 tolerance
 * above: a write that reported success on a host that never stored it is a
 * silent failure, so every status — including the 400 of a rejected name or
 * photo — reaches the caller.
 * @assistant group:settings unconfirmed: Reversible personal display overrides; costs nothing and changes no permissions.
 */
export async function setMyProfile(
  scope: HttpScope,
  update: EditableProfileUpdate,
): Promise<EditableProfile> {
  const res = await httpRequest(scope, "/v1/me/profile", {
    method: "PUT",
    body: JSON.stringify(update),
  });
  return (await res.json()) as EditableProfile;
}

/**
 * Lists the user's active API keys.
 *
 * The caller's active API keys, newest first. No secrets — display prefixes only.
 *
 * Not confirmed: a read. It names the user's keys and reveals no secret.
 * @assistant group:api-keys
 * @assistant hidden: the hosted gateway's scope wall denies the key routes to this surface, so a dispatched listing can only fail.
 */
export async function listApiKeys(scope: HttpScope): Promise<ApiKey[]> {
  const res = await httpRequest(scope, "/v1/keys");
  const body = (await res.json()) as { keys: ApiKey[] };
  return body.keys;
}

/**
 * Creates a new API key for the user.
 *
 * Mint a personal API key. Returns the FULL secret (`key`) exposed ONLY here and
 * never retrievable again, so the caller reveals it once and keeps it out of any
 * cache. ≥20 active keys → `400 {code:"key_limit"}`; every error throws so the UI
 * surfaces the real reason (the limit inline, anything else as a bug toast).
 * @assistant group:api-keys confirm: outward. It mints a credential that reaches the account's data from anywhere, and the secret is shown once.
 * @assistant hidden: returns a secret; the full key is revealed once and must not pass through a chat turn.
 */
export async function createApiKey(
  scope: HttpScope,
  name: string,
): Promise<ApiKeyCreated> {
  const res = await httpRequest(scope, "/v1/keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as ApiKeyCreated;
}

/**
 * Permanently revokes one of the user's API keys.
 *
 * Soft-revoke a key by id. Idempotent from the user's view: an unknown, foreign,
 * or already-revoked id answers `404` (no existence leak). No body on success.
 *
 * @assistant group:api-keys confirm: irreversible. A revoked key never works again, and anything signing with it stops without warning.
 * @assistant hidden: the hosted gateway's scope wall denies the key routes to this surface, so a dispatched revoke can only fail.
 */
export async function revokeApiKey(
  scope: HttpScope,
  id: string,
): Promise<void> {
  await httpRequest(scope, `/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createAccountHttp(ctx: ScopeContext): AccountHttp {
  const scope = moduleScope(ctx, "account", AccountHttpError);

  return {
    getMyProfile: () => getMyProfile(scope),
    setMyProfile: (update) => setMyProfile(scope, update),
    listApiKeys: () => listApiKeys(scope),
    createApiKey: (name) => createApiKey(scope, name),
    revokeApiKey: (id) => revokeApiKey(scope, id),
  };
}
