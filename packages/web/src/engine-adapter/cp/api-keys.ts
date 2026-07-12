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

/** The caller's active API keys, newest first. No secrets — display prefixes only. */
export async function listApiKeys(cfg: ControlPlaneConfig): Promise<ApiKey[]> {
  const res = await cpFetch(cfg, "/v1/keys");
  const body = (await res.json()) as { keys: ApiKey[] };
  return body.keys;
}

/**
 * Mint a personal API key. Returns the FULL secret (`key`) exposed ONLY here and
 * never retrievable again, so the caller reveals it once and keeps it out of any
 * cache. ≥20 active keys → `400 {code:"key_limit"}`; every error throws so the UI
 * surfaces the real reason (the limit inline, anything else as a bug toast).
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
 * Soft-revoke a key by id. Idempotent from the user's view: an unknown, foreign,
 * or already-revoked id answers `404` (no existence leak). No body on success.
 */
export async function revokeApiKey(
  cfg: ControlPlaneConfig,
  id: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
