import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  createWriteLeaseProbe,
  fetchWithRetry,
  HttpObjectStore,
} from "@houston/runtime-client/object-sync";
import { waitForPredecessorDrain } from "../store-sync/predecessor-drain";
import { severityLog } from "./host-log";

function optionalPositiveNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

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
  let generations: boolean | undefined;
  const agentBaseUrl = `${root}/${encodeURIComponent(agentSlug)}`;
  const store = new HttpObjectStore({
    baseUrl: agentBaseUrl,
    token: hostToken,
    bootId,
    fence,
  });
  await waitForPredecessorDrain({ store, log: severityLog });
  fence.token = undefined;
  try {
    const res = await fetchWithRetry(
      (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
      `${agentBaseUrl}/lease`,
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
      const body = (await res.json()) as {
        token?: string;
        generations?: boolean;
      };
      if (typeof body.token === "string" && body.token !== "") {
        fence.token = body.token;
      }
      if (typeof body.generations === "boolean") {
        generations = body.generations;
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
      store,
      leaseProbe: createWriteLeaseProbe({
        baseUrl: agentBaseUrl,
        token: hostToken,
        bootId,
        fence,
      }),
      leaseClaimed: () => fence.token !== undefined,
      quietMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_QUIET_MS"),
      intervalMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_INTERVAL_MS"),
      maxHydrateBytes:
        hydrateMaxMb === undefined ? undefined : hydrateMaxMb * 1024 * 1024,
      generations,
    },
    sharedMirror: {
      store: new HttpObjectStore({
        baseUrl: `${root}/shared`,
        token: hostToken,
        agentSlug,
      }),
      mirrorDir: join(houstonHome, "shared-mirror"),
      generations,
    },
  };
}
