import type {
  ApiKey,
  ApiKeyCreated,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Personal API keys (C9 §Credential) — the user's programmatic credential for
 * the public API. Always mounted on the gateway (no control-plane dependency),
 * but the frontend gates the whole surface on `capabilities.apiKeys`, so these
 * are never reached off a gateway that serves the public API.
 *
 * Every call routes through `cpFetch`, so a non-2xx surfaces as a
 * `HoustonEngineError` carrying the gateway's reason (never swallowed). The
 * `key_limit` 400 therefore reaches the caller intact for its inline treatment.
 */

/**
 * Lists the user's active API keys.
 *
 * The caller's active API keys, newest first. No secrets — display prefixes only.
 *
 * Not confirmed: a read. It names the user's keys and reveals no secret.
 * @assistant group:api-keys hidden: credential management stays with the person; the hosted gateway's scope wall denies key routes to this surface anyway.
 */
export async function listApiKeys(cfg: ControlPlaneConfig): Promise<ApiKey[]> {
  const res = await cpFetch(cfg, "/v1/keys");
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
 * @assistant group:api-keys confirm hidden: returns a secret; the full key is revealed once and must not pass through a chat turn.
 */
export async function createApiKey(
  cfg: ControlPlaneConfig,
  name: string,
): Promise<ApiKeyCreated> {
  const res = await cpFetch(cfg, "/v1/keys", {
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
 * Confirmed: irreversible. A revoked key never works again, and anything
 * signing with it stops without warning.
 * @assistant group:api-keys confirm hidden: credential management stays with the person; the hosted gateway's scope wall denies key routes to this surface anyway.
 */
export async function revokeApiKey(
  cfg: ControlPlaneConfig,
  id: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
