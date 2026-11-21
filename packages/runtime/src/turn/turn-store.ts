import {
  HttpObjectStore,
  type ObjectStore,
  PrefetchedObjectStore,
} from "@houston/runtime-client/object-sync";
import type { TurnRequest } from "./types";

export interface TurnStoreConfig {
  poolStoreUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ResolvedTurnStore {
  store: ObjectStore;
  prefix: string;
  live?: ObjectStore;
  inlined?: ReadonlyMap<string, { generation?: string }>;
}

export function poolOnlyFallbackStore(): ObjectStore {
  const unavailable = async (): Promise<never> => {
    throw new Error("this pooled worker requires a claim-backed object store");
  };
  return {
    list: unavailable,
    download: unavailable,
    upload: unavailable,
    delete: unavailable,
  };
}

export function poolIdentity(gcsPrefix: string): {
  org: string;
  agent: string;
} {
  const segments = gcsPrefix.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== "ws" ||
    !segments[1] ||
    !segments[2]
  ) {
    throw new Error("claimed turn has invalid 'gcsPrefix'");
  }
  return { org: segments[1], agent: segments[2] };
}

export function resolveTurnStore(
  turn: Pick<
    TurnRequest,
    "gcsPrefix" | "claim" | "hostToken" | "conversationId" | "prefetch"
  >,
  fallback: ObjectStore,
  config: TurnStoreConfig = {},
): ResolvedTurnStore {
  const poolStoreUrl =
    config.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!turn.claim || !turn.hostToken || !poolStoreUrl) {
    return { store: fallback, prefix: turn.gcsPrefix };
  }
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const root = poolStoreUrl.replace(/\/+$/, "");
  const http = new HttpObjectStore({
    baseUrl: `${root}/v1/pod/store/${encodeURIComponent(org)}/${encodeURIComponent(agent)}`,
    token: turn.hostToken,
    claim: {
      token: turn.claim.token,
      bootId: turn.claim.bootId,
      conversationId: turn.conversationId,
    },
    batchReads: true,
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  });
  return {
    store: turn.prefetch
      ? new PrefetchedObjectStore(http, turn.prefetch)
      : http,
    prefix: "",
    live: http,
    ...(turn.prefetch
      ? {
          inlined: new Map(
            [...turn.prefetch.objects].map(([key, { generation }]) => [
              key,
              generation ? { generation } : {},
            ]),
          ),
        }
      : {}),
  };
}
