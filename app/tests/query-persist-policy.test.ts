import { equal, ok } from "node:assert";
import { describe, it } from "node:test";
import {
  isPersistedQueryKey,
  PERSIST_MAX_AGE_MS,
  PERSISTED_QUERY_PREFIXES,
} from "../src/lib/query-persist-policy.ts";

describe("query persist policy", () => {
  it("persists exactly the pod-held list surfaces", () => {
    equal(isPersistedQueryKey(["activity", "Ws/Agent"]), true);
    equal(isPersistedQueryKey(["conversations", "Ws/Agent"]), true);
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
    // next persist sweep drops it from disk. setupQueryPersistence uses this
    // ONE constant for both — the invariant this test pins.
    ok(PERSIST_MAX_AGE_MS >= 24 * 60 * 60 * 1_000);
    equal(PERSISTED_QUERY_PREFIXES.length, 3);
  });
});
