import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { resetQueryCacheForIdentityChange } from "../src/lib/identity-cache-reset.ts";

// PRODUCT-1235: after sign-out, the next sign-in did NOTHING until a relaunch.
// The identity reset used `queryClient.clear()`, which destroys the
// `["session"]` Query while the auth gates' observers are still attached; the
// next `setQueryData` builds a replacement Query with zero observers, so the
// sign-in's session write renders nothing. The reset must purge every
// identity-scoped query WITHOUT breaking the session query's subscriptions.

const queryClient = new QueryClient();

// TanStack batches observer notifications through a setTimeout(0) scheduler;
// observer callbacks land on the next macrotask.
const flushNotifications = () =>
  new Promise((resolve) => setTimeout(resolve, 1));

/** A mounted `useSession` stand-in: an observer subscribed to `["session"]`. */
function observeSession(seen: unknown[]): () => void {
  const observer = new QueryObserver(queryClient, {
    queryKey: ["session"],
    queryFn: () => null,
    staleTime: Number.POSITIVE_INFINITY,
    enabled: false,
  });
  return observer.subscribe((result) => {
    seen.push(result.data);
  });
}

afterEach(() => {
  queryClient.clear();
});

describe("resetQueryCacheForIdentityChange", () => {
  it("drops identity-scoped queries — active-observer data AND inactive data", () => {
    queryClient.setQueryData(["agents"], [{ id: "outgoing-account-agent" }]);
    queryClient.setQueryData(["onboarding-completed", "u1"], true);

    resetQueryCacheForIdentityChange(queryClient);

    assert.strictEqual(queryClient.getQueryData(["agents"]), undefined);
    assert.strictEqual(
      queryClient.getQueryData(["onboarding-completed", "u1"]),
      undefined,
    );
  });

  it("clears the mutation cache (parity with the old queryClient.clear())", () => {
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: async () => null });
    assert.strictEqual(queryClient.getMutationCache().getAll().length, 1);

    resetQueryCacheForIdentityChange(queryClient);

    assert.strictEqual(queryClient.getMutationCache().getAll().length, 0);
  });

  it("keeps the session query's observers live so the next sign-in renders (PRODUCT-1235)", async () => {
    queryClient.setQueryData(["session"], { uid: "outgoing" });
    const seen: unknown[] = [];
    const unsubscribe = observeSession(seen);

    resetQueryCacheForIdentityChange(queryClient);
    // What `cacheSession` does when the next account signs in.
    queryClient.setQueryData(["session"], { uid: "incoming" });
    await flushNotifications();
    unsubscribe();

    assert.deepStrictEqual(seen.at(-1), { uid: "incoming" });
  });

  it("canary: queryClient.clear() orphans those observers — never go back to it", async () => {
    queryClient.setQueryData(["session"], { uid: "outgoing" });
    const seen: unknown[] = [];
    const unsubscribe = observeSession(seen);

    queryClient.clear();
    queryClient.setQueryData(["session"], { uid: "incoming" });
    await flushNotifications();
    unsubscribe();

    // The write landed on a rebuilt, observer-less query: nobody saw it. This
    // is the exact mechanism behind the PRODUCT-1235 freeze.
    assert.notDeepStrictEqual(seen.at(-1), { uid: "incoming" });
    assert.deepStrictEqual(queryClient.getQueryData(["session"]), {
      uid: "incoming",
    });
  });
});
