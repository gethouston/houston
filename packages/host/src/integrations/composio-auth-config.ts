import type { ComposioHttp } from "./composio-http";
import type { RawAuthConfig } from "./composio-wire";

/**
 * The project's auth config for a toolkit: reuse an enabled one, else create
 * one on Composio-managed auth (their OAuth app — no Google registration on
 * our side). The caller caches per process; a restart just re-resolves the
 * same config.
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
        auth_config: { type: "use_composio_managed_auth" },
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
