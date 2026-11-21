import { equal, ok } from "node:assert";
import { describe, it } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  isPersistedQueryKey,
  markRestoredListsStale,
  PERSIST_MAX_AGE_MS,
  PERSISTED_QUERY_PREFIXES,
} from "../src/lib/query-persist-policy.ts";

describe("query persist policy", () => {
  it("persists exactly the pod-held list surfaces", () => {
    equal(isPersistedQueryKey(["activity", "Ws/Agent"]), true);
    equal(isPersistedQueryKey(["all-conversations", "Ws/A", "Ws/B"]), true);
  });

  it("never persists transcripts, auth, or gateway-served surfaces", () => {
    equal(isPersistedQueryKey(["chat-history", "Ws/Agent", "sess"]), false);
    equal(isPersistedQueryKey(["session"]), false);
    equal(isPersistedQueryKey(["provider-statuses"]), false);
    equal(isPersistedQueryKey(["org"]), false);
    equal(isPersistedQueryKey(["skills", "Ws/Agent"]), false);
    equal(isPersistedQueryKey([]), false);
    equal(isPersistedQueryKey([42]), false);
  });

  it("keeps restorable age and in-memory gc in lockstep", () => {
    ok(PERSIST_MAX_AGE_MS >= 24 * 60 * 60 * 1_000);
    equal(PERSISTED_QUERY_PREFIXES.length, 2);
  });
});

describe("markRestoredListsStale", () => {
  const TEN_MINUTES = 10 * 60_000;

  it("revalidates a restored list younger than its staleTime (HOU-198)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: TEN_MINUTES } },
    });
    const board = ["all-conversations", "Ws/A"];
    qc.setQueryData(board, [{ id: "old" }], {
      updatedAt: Date.now() - 60_000,
    });
    qc.setQueryData(["skills", "Ws/A"], ["skill"]);

    await markRestoredListsStale(qc);

    equal(qc.getQueryState(board)?.isInvalidated, true);
    equal(qc.getQueryState(["skills", "Ws/A"])?.isInvalidated, false);

    let reads = 0;
    const observer = new QueryObserver(qc, {
      queryKey: board,
      queryFn: async () => {
        reads += 1;
        return [{ id: "old" }, { id: "api-card" }];
      },
      staleTime: TEN_MINUTES,
    });
    equal(observer.getCurrentResult().data?.length, 1);
    const unsubscribe = observer.subscribe(() => {});
    await qc.getQueryCache().find({ queryKey: board })?.promise;
    unsubscribe();

    equal(reads, 1);
    equal(qc.getQueryData<unknown[]>(board)?.length, 2);
  });

  it("fetches nothing by itself, even for a subscribed list", async () => {
    let reads = 0;
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: TEN_MINUTES } },
    });
    const key = ["activity", "Ws/A"];
    qc.setQueryData(key, []);
    const observer = new QueryObserver(qc, {
      queryKey: key,
      queryFn: async () => {
        reads += 1;
        return [];
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await markRestoredListsStale(qc);
    unsubscribe();
    equal(reads, 0);
    equal(qc.getQueryState(key)?.isInvalidated, true);
  });
});
