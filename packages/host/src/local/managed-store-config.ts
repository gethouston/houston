import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  fetchWithRetry,
  HttpObjectStore,
} from "@houston/runtime-client/object-sync";

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
  // Claim the write lease for THIS boot before anything hydrates or syncs.
  // Every legitimate new writer boots (kubelet container restarts and node
  // reschedules included — neither passes through a control-plane wake), and
  // a resumed zombie by definition does not re-run boot, so it cannot
  // re-claim. A 404 is an old/unfenced gateway: proceed exactly as today and
  // let the response-header capture pick up a token if one ever appears.
  // Any other failure is fatal — syncing unfenced against a fencing gateway
  // would 409 the first write anyway; die loudly and let the pod restart.
  try {
    const res = await fetchWithRetry(
      (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
      `${root}/${encodeURIComponent(agentSlug)}/lease`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hostToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ bootId }),
      },
    );
    if (res.ok) {
      const body = (await res.json()) as { token?: string };
      if (typeof body.token === "string" && body.token !== "") {
        fence.token = body.token;
      }
    } else if (res.status !== 404) {
      return fatal(
        `[local-host] write-lease claim failed (${res.status}): the store gateway fences writes but refused this boot's claim.`,
      );
    }
  } catch (err) {
    return fatal(
      `[local-host] write-lease claim unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    podGateway: {
      baseUrl: url,
      orgSlug,
      agentSlug,
      podToken: hostToken,
      bootId,
      fence,
    },
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
