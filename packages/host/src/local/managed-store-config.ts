import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { HttpObjectStore } from "@houston/runtime-client/object-sync";

function optionalPositiveNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

/**
 * Both managed-pod caches ride the same gateway and bearer. Agent state uses
 * the read/write agent prefix; shared state uses the read/write org prefix and
 * binds every request to this pod's agent slug.
 */
export async function managedStoreConfig(
  hostToken: string | undefined,
  houstonHome: string,
  fatal: (message: string) => Promise<never>,
) {
  const url = process.env.HOUSTON_STORE_URL;
  if (!url) return undefined;
  const orgSlug = process.env.HOUSTON_ORG_SLUG;
  const agentSlug = process.env.HOUSTON_AGENT_SLUG;
  if (!orgSlug || !agentSlug || !hostToken) {
    return fatal(
      "[local-host] incomplete managed object-store env: set HOUSTON_STORE_URL, HOUSTON_ORG_SLUG, HOUSTON_AGENT_SLUG, and HOUSTON_HOST_TOKEN together.",
    );
  }

  const root = `${url.replace(/\/+$/, "")}/v1/pod/store/${encodeURIComponent(orgSlug)}`;
  const hydrateMaxMb = optionalPositiveNumber("HOUSTON_HYDRATE_MAX_MB");
  const bootId = randomUUID();
  const fence: { token?: string } = {};
  return {
    storeSync: {
      store: new HttpObjectStore({
        baseUrl: `${root}/${encodeURIComponent(agentSlug)}`,
        token: hostToken,
        bootId,
        fence,
      }),
      quietMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_QUIET_MS"),
      intervalMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_INTERVAL_MS"),
      maxHydrateBytes:
        hydrateMaxMb === undefined ? undefined : hydrateMaxMb * 1024 * 1024,
    },
    sharedMirror: {
      store: new HttpObjectStore({
        baseUrl: `${root}/shared`,
        token: hostToken,
        agentSlug,
      }),
      mirrorDir: join(houstonHome, "shared-mirror"),
    },
  };
}
