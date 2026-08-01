import { ComposioApiError, type ComposioHttp } from "./composio-http";
import type { RawAuthConfig } from "./composio-wire";
import { IntegrationUpstreamError } from "./types";

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
 * The toolkit metadata is a CLAIM, not a guarantee: Composio can advertise
 * managed auth for a toolkit whose managed OAuth app is expired or withdrawn
 * (shopify, clockify — HOU-1020: creating the managed config 400s with
 * "Missing required field Client id"). So candidate specs are tried in order —
 * managed first, then the user-collectible scheme — and a 400 on the managed
 * create falls through instead of surfacing as an opaque 502.
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

  const specs = await candidateSpecs(http, toolkit);
  let id: string | undefined;
  for (const [i, spec] of specs.entries()) {
    try {
      id = await createAuthConfig(http, toolkit, spec);
      break;
    } catch (err) {
      // Only the MANAGED candidate's 400 is survivable — it means the
      // advertised managed app does not actually exist. With a collectible
      // scheme still on deck, fall through to it; without one the toolkit is
      // OAuth-only, so name the operator remedy instead of relaying an opaque
      // 400. Anything else — transient 5xx, a failed custom create — surfaces.
      const managedRejected =
        err instanceof ComposioApiError &&
        err.status === 400 &&
        spec.type === "use_composio_managed_auth";
      if (!managedRejected) throw err;
      if (i === specs.length - 1) throw oauthOnlyError(toolkit);
    }
  }
  if (!id) {
    throw new Error(
      `composio: creating auth config for '${toolkit}' returned no id`,
    );
  }
  cache.set(toolkit, id);
  return id;
}

async function createAuthConfig(
  http: ComposioHttp,
  toolkit: string,
  spec: Record<string, unknown>,
): Promise<string | undefined> {
  const created = await http.call<{ auth_config?: { id?: string } }>(
    "/api/v3/auth_configs",
    {
      method: "POST",
      body: { toolkit: { slug: toolkit }, auth_config: spec },
    },
  );
  return created?.auth_config?.id;
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

/** A coded 400, not a plain Error: connecting such a toolkit (twitter —
 *  HOU-1116) is impossible until the OPERATOR registers a developer OAuth app
 *  in the Composio dashboard, so the client must receive an expected,
 *  explainable state it can render calmly, never an opaque 500. */
function oauthOnlyError(toolkit: string): IntegrationUpstreamError {
  const detail = `composio: toolkit '${toolkit}' only offers OAuth and Composio has no managed app for it — register a developer OAuth app for it in the Composio dashboard, then connecting will reuse that auth config`;
  return new IntegrationUpstreamError(
    400,
    { error: detail, code: "toolkit_oauth_unmanaged" },
    detail,
  );
}

/** The ordered auth-config specs worth attempting: managed auth when Composio
 *  advertises it, then the toolkit's first scheme the hosted connect page can
 *  collect from the user (never bare custom OAuth). NO_AUTH is not a scheme
 *  either: Composio rejects auth configs for no-auth toolkits
 *  (Auth_Config_NoAuthApp), so a connect attempt on one — a stale catalog, an
 *  agent suggesting it — fails as a clean 400 the UI can show, not a 502. */
async function candidateSpecs(
  http: ComposioHttp,
  toolkit: string,
): Promise<Record<string, unknown>[]> {
  const detail = await http.call<RawToolkitDetail>(
    `/api/v3/toolkits/${encodeURIComponent(toolkit)}`,
  );
  const modes = (detail?.auth_config_details ?? []).flatMap((d) =>
    d.mode ? [d.mode] : [],
  );
  const connectable = modes.filter((m) => m.toUpperCase() !== "NO_AUTH");
  const collectible = connectable.find(
    (m) => !OAUTH_MODES.has(m.toUpperCase()),
  );

  const specs: Record<string, unknown>[] = [];
  if ((detail?.composio_managed_auth_schemes ?? []).length > 0) {
    specs.push({ type: "use_composio_managed_auth" });
  }
  if (collectible) {
    specs.push({
      type: "use_custom_auth",
      authScheme: collectible,
      credentials: {},
    });
  }
  if (specs.length > 0) return specs;

  if (modes.length > 0 && connectable.length === 0) {
    throw new IntegrationUpstreamError(400, {
      error: `${toolkit} does not need connecting; its tools work without an account`,
      code: "toolkit_no_auth",
    });
  }
  throw connectable.length > 0
    ? oauthOnlyError(toolkit)
    : new Error(
        `composio: toolkit '${toolkit}' offers no connectable auth scheme`,
      );
}
