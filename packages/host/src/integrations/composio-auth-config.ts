import type { ComposioHttp } from "./composio-http";
import type { RawAuthConfig } from "./composio-wire";

/**
 * The project's auth config for a toolkit: reuse an enabled one, else create
 * one. Which kind depends on how the toolkit authenticates:
 *
 *  - Composio-managed OAuth available (gmail, slack…) → `use_composio_managed_auth`
 *    (their OAuth app; no Google registration on our side).
 *  - No managed auth (API-key/bearer toolkits like serpapi) → `use_custom_auth`
 *    with the toolkit's own scheme and EMPTY credentials: the auth config is
 *    just the container; the hosted connect link then asks the USER for their
 *    key (verified live — `connected_account_initiation.required` fields are
 *    collected on connect.composio.dev). Same Connect UX either way.
 *
 * The caller caches per process; a restart just re-resolves the same config.
 */
export async function resolveAuthConfig(
  http: ComposioHttp,
  cache: Map<string, string>,
  toolkit: string,
): Promise<string> {
  const cached = cache.get(toolkit);
  if (cached) return cached;

  const existing = await http.call<{ items?: RawAuthConfig[] }>(
    "/api/v3/auth_configs",
    { query: { toolkit_slug: toolkit, limit: "100" } },
  );
  const enabled = (existing?.items ?? []).find(
    (c) => c.id && c.status !== "DISABLED",
  );
  if (enabled?.id) {
    cache.set(toolkit, enabled.id);
    return enabled.id;
  }

  const created = await http.call<{ auth_config?: { id?: string } }>(
    "/api/v3/auth_configs",
    {
      method: "POST",
      body: {
        toolkit: { slug: toolkit },
        auth_config: await authConfigSpec(http, toolkit),
      },
    },
  );
  const id = created?.auth_config?.id;
  if (!id) {
    throw new Error(
      `composio: creating auth config for '${toolkit}' returned no id`,
    );
  }
  cache.set(toolkit, id);
  return id;
}

interface RawToolkitDetail {
  composio_managed_auth_schemes?: string[];
  auth_config_details?: { mode?: string }[];
}

/** OAuth needs a REGISTERED developer app (client id/secret) behind the auth
 *  config — an empty custom OAuth config can never complete the dance, it just
 *  fails at connect time (metaads was the canonical case). Every other scheme
 *  (API_KEY, BEARER_TOKEN, BASIC…) is collectible from the USER on the hosted
 *  connect page, so only those are connectable fallbacks. */
const OAUTH_MODES = new Set(["OAUTH1", "OAUTH1A", "OAUTH2"]);

/** Managed auth when Composio offers it; else the toolkit's first scheme the
 *  hosted connect page can collect from the user (never bare custom OAuth). */
async function authConfigSpec(
  http: ComposioHttp,
  toolkit: string,
): Promise<Record<string, unknown>> {
  const detail = await http.call<RawToolkitDetail>(
    `/api/v3/toolkits/${encodeURIComponent(toolkit)}`,
  );
  if ((detail?.composio_managed_auth_schemes ?? []).length > 0) {
    return { type: "use_composio_managed_auth" };
  }
  const modes = (detail?.auth_config_details ?? []).flatMap((d) =>
    d.mode ? [d.mode] : [],
  );
  const scheme = modes.find((m) => !OAUTH_MODES.has(m.toUpperCase()));
  if (!scheme) {
    throw new Error(
      modes.length > 0
        ? `composio: toolkit '${toolkit}' only offers OAuth and Composio has no managed app for it — register a developer OAuth app for it in the Composio dashboard, then connecting will reuse that auth config`
        : `composio: toolkit '${toolkit}' offers no connectable auth scheme`,
    );
  }
  return { type: "use_custom_auth", authScheme: scheme, credentials: {} };
}
