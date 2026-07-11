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
});
