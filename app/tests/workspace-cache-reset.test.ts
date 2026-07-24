import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { resetCacheForSpaceChange } from "../src/lib/space-cache.ts";

// C8 §Active space: switching to a different space must DROP the whole query
// cache, not merely mark it stale. invalidateQueries() leaves every INACTIVE
// query's data in cache for gcTime (query keys are NOT org-scoped — the space
// is only an x-houston-org header), so a not-currently-mounted view keeps the
// prior space's data and stale-while-revalidate flashes cross-tenant data on
// navigation. removeQueries() discards inactive-query data too.

const queryClient = new QueryClient();

afterEach(() => {
  queryClient.clear();
});

describe("resetCacheForSpaceChange", () => {
  it("drops inactive-query data on a real space change", () => {
    // An inactive (no-observer) query loaded under the prior space.
    queryClient.setQueryData(["agents"], [{ id: "prior-space-agent" }]);
    assert.deepStrictEqual(queryClient.getQueryData(["agents"]), [
      { id: "prior-space-agent" },
    ]);

    resetCacheForSpaceChange(queryClient, true);

    // Must be GONE — not merely stale. This fails with invalidateQueries().
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
    // Tenant data (per-space) — must be dropped.
    queryClient.setQueryData(["agents"], [{ id: "prior-space-agent" }]);
    queryClient.setQueryData(["capabilities"], { role: "owner" });
    // User-scoped, space-invariant — must SURVIVE (purging them flaps the
    // auth/onboarding gates and re-blanks the shell mid-switch).
    queryClient.setQueryData(["session"], { uid: "u1" });
    queryClient.setQueryData(["onboarding-pending"], false);
    queryClient.setQueryData(["onboarding-completed", "u1"], true);

    resetCacheForSpaceChange(queryClient, true);

    // Tenant keys gone.
    assert.strictEqual(queryClient.getQueryData(["agents"]), undefined);
    assert.strictEqual(queryClient.getQueryData(["capabilities"]), undefined);
    // User-scoped keys intact.
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
