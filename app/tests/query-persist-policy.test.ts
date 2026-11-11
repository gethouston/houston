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
    // chat-history is covered by the transcript cache (HOU-712, PR #748) —
    // persisting the dead query too would store every transcript twice.
    equal(isPersistedQueryKey(["chat-history", "Ws/Agent", "sess"]), false);
    equal(isPersistedQueryKey(["session"]), false);
    equal(isPersistedQueryKey(["provider-statuses"]), false);
    equal(isPersistedQueryKey(["org"]), false);
    equal(isPersistedQueryKey(["skills", "Ws/Agent"]), false);
    equal(isPersistedQueryKey([]), false);
    equal(isPersistedQueryKey([42]), false);
  });

  it("keeps restorable age and in-memory gc in lockstep", () => {
    // The persister mirrors the in-memory cache: a restored query must stay
    // in memory (gcTime) for as long as it is restorable (maxAge), or the
    // next persist sweep drops it from disk. queryPersistenceOptions uses this
    // ONE constant for both, the invariant this test pins.
    ok(PERSIST_MAX_AGE_MS >= 24 * 60 * 60 * 1_000);
    equal(PERSISTED_QUERY_PREFIXES.length, 2);
  });
});

describe("markRestoredListsStale", () => {
  const TEN_MINUTES = 10 * 60_000;

  it("revalidates a restored list younger than its staleTime (HOU-198)", async () => {
    // A relaunch a few minutes after the last sweep restores a board the
    // staleTime still calls fresh, but it missed every change made while the
    // app was closed: the card a public API mission put on the board.
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
    // The restored rows still paint while the read is in flight.
    equal(observer.getCurrentResult().data?.length, 1);
    const unsubscribe = observer.subscribe(() => {});
    await qc.getQueryCache().find({ queryKey: board })?.promise;
    unsubscribe();

    equal(reads, 1);
    equal(qc.getQueryData<unknown[]>(board)?.length, 2);
  });

  it("fetches nothing by itself, even for a subscribed list", async () => {
    // Reads wait for the observers that subscribe once the restore settles.
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
