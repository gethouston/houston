import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  isSpaceInvariantQueryKey,
  resetCacheForSpaceChange,
} from "../src/lib/space-cache.ts";

const queryClient = new QueryClient();

afterEach(() => {
  queryClient.clear();
});

describe("resetCacheForSpaceChange", () => {
  it("drops inactive-query data on a real space change", () => {
    queryClient.setQueryData(["agents"], [{ id: "prior-space-agent" }]);
    assert.deepStrictEqual(queryClient.getQueryData(["agents"]), [
      { id: "prior-space-agent" },
    ]);

    resetCacheForSpaceChange(queryClient, true);

    assert.strictEqual(queryClient.getQueryData(["agents"]), undefined);
  });

  it("leaves the cache untouched when the space did not change", () => {
    queryClient.setQueryData(["agents"], [{ id: "same-space-agent" }]);

    resetCacheForSpaceChange(queryClient, false);

    assert.deepStrictEqual(queryClient.getQueryData(["agents"]), [
      { id: "same-space-agent" },
    ]);
  });

  it("preserves user-scoped, space-invariant keys on a real change (HOU-907)", () => {
    queryClient.setQueryData(["agents"], [{ id: "prior-space-agent" }]);
    queryClient.setQueryData(["capabilities"], { role: "owner" });
    queryClient.setQueryData(["session"], { uid: "u1" });
    queryClient.setQueryData(["onboarding-pending"], false);
    queryClient.setQueryData(["onboarding-completed", "u1"], true);

    resetCacheForSpaceChange(queryClient, true);

    assert.strictEqual(queryClient.getQueryData(["agents"]), undefined);
    assert.strictEqual(queryClient.getQueryData(["capabilities"]), undefined);
    assert.deepStrictEqual(queryClient.getQueryData(["session"]), {
      uid: "u1",
    });
    assert.strictEqual(queryClient.getQueryData(["onboarding-pending"]), false);
    assert.strictEqual(
      queryClient.getQueryData(["onboarding-completed", "u1"]),
      true,
    );
  });
});

describe("isSpaceInvariantQueryKey", () => {
  it("holds identity and the first-run flags out of any sweep", () => {
    assert.strictEqual(isSpaceInvariantQueryKey(["session"]), true);
    assert.strictEqual(isSpaceInvariantQueryKey(["onboarding-pending"]), true);
    assert.strictEqual(
      isSpaceInvariantQueryKey(["onboarding-completed", "u1"]),
      true,
    );
  });

  it("lets every event-driven key through", () => {
    for (const key of [
      ["agents"],
      ["capabilities"],
      ["all-conversations"],
      ["activity", "Personal/Maya"],
      ["routines", "Personal/Maya"],
    ]) {
      assert.strictEqual(isSpaceInvariantQueryKey(key), false, String(key));
    }
  });
});
