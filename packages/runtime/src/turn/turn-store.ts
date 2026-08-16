import {
  HttpObjectStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import type { TurnRequest } from "./types";

/** Per-turn object-store selection inputs. */
export interface TurnStoreConfig {
  poolStoreUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Store and key prefix selected for an admitted turn. */
export interface ResolvedTurnStore {
  store: ObjectStore;
  prefix: string;
}

/** Fail-loud fallback used when turn mode has only the pool store configured. */
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

/** Parse the exact `ws/<org>/<agent>` identity encoded in a pool prefix. */
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

/** Select claim-backed HTTP storage or preserve the configured legacy store. */
export function resolveTurnStore(
  turn: TurnRequest,
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
  return {
    store: new HttpObjectStore({
      baseUrl: `${root}/v1/pod/store/${encodeURIComponent(org)}/${encodeURIComponent(agent)}`,
      token: turn.hostToken,
      claim: { token: turn.claim.token, bootId: turn.claim.bootId },
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    }),
    prefix: "",
  };
}
