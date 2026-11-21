import {
  TOOLKIT_NO_AUTH,
  TOOLKIT_NOT_FOUND,
  TOOLKIT_OAUTH_UNAVAILABLE,
} from "@houston/wire-types";
import { ComposioApiError, type ComposioHttp } from "./composio-http";
import type { RawAuthConfig } from "./composio-wire";
import { IntegrationUpstreamError } from "./types";

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

const OAUTH_MODES = new Set(["OAUTH1", "OAUTH1A", "OAUTH2"]);

function oauthOnlyError(toolkit: string): Error {
  return new IntegrationUpstreamError(
    400,
    {
      error: `connecting ${toolkit} is not available yet: it needs an OAuth app registered in the Composio dashboard`,
      code: TOOLKIT_OAUTH_UNAVAILABLE,
    },
    `composio: toolkit '${toolkit}' only offers OAuth and Composio has no managed app for it — register a developer OAuth app for it in the Composio dashboard, then connecting will reuse that auth config`,
  );
}

async function candidateSpecs(
  http: ComposioHttp,
  toolkit: string,
): Promise<Record<string, unknown>[]> {
  const detail = await http.call<RawToolkitDetail>(
    `/api/v3/toolkits/${encodeURIComponent(toolkit)}`,
    { nullStatuses: [404] },
  );
  if (!detail) {
    throw new IntegrationUpstreamError(400, {
      error: `${toolkit} is not an app Houston can connect`,
      code: TOOLKIT_NOT_FOUND,
    });
  }
  const modes = (detail.auth_config_details ?? []).flatMap((d) =>
    d.mode ? [d.mode] : [],
  );
  const connectable = modes.filter((m) => m.toUpperCase() !== "NO_AUTH");
  const collectible = connectable.find(
    (m) => !OAUTH_MODES.has(m.toUpperCase()),
  );

  const specs: Record<string, unknown>[] = [];
  if ((detail.composio_managed_auth_schemes ?? []).length > 0) {
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
      code: TOOLKIT_NO_AUTH,
    });
  }
  throw connectable.length > 0
    ? oauthOnlyError(toolkit)
    : new Error(
        `composio: toolkit '${toolkit}' offers no connectable auth scheme`,
      );
}
