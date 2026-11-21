import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { forgetAssistantAddresses } from "../src/lib/assistant-address-cache.ts";
import { queryKeys } from "../src/lib/query-keys.ts";
import {
  heldOutOfCatchUpSweep,
  resetCacheForSpaceChange,
} from "../src/lib/space-cache.ts";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

afterEach(() => {
  queryClient.clear();
});

const PERSONAL = "default";
const TEAM = "org:00112233aabbccdd";
const handle = (agent: string) => ({ agent, conversation: "assistant" });

async function failDiscovery(spaceId: string) {
  await queryClient
    .fetchQuery({
      queryKey: queryKeys.assistant(spaceId),
      queryFn: () => Promise.reject(new Error("pod waking")),
    })
    .catch(() => {});
}

describe("a space switch", () => {
  it("keeps every space's address, so switching back asks nothing", () => {
    queryClient.setQueryData(queryKeys.assistant(PERSONAL), handle("a551p"));
    queryClient.setQueryData(queryKeys.assistant(TEAM), handle("a551t"));
    queryClient.setQueryData(["agents"], [{ id: "prior-space-agent" }]);

    resetCacheForSpaceChange(queryClient, true);

    assert.deepStrictEqual(
      queryClient.getQueryData(queryKeys.assistant(PERSONAL)),
      handle("a551p"),
    );
    assert.deepStrictEqual(
      queryClient.getQueryData(queryKeys.assistant(TEAM)),
      handle("a551t"),
    );
    assert.strictEqual(queryClient.getQueryData(["agents"]), undefined);
  });

  it("drops an unanswered discovery, whose retries would carry the new space", async () => {
    await failDiscovery(TEAM);

    resetCacheForSpaceChange(queryClient, true);

    assert.strictEqual(
      queryClient.getQueryCache().find({ queryKey: queryKeys.assistant(TEAM) }),
      undefined,
    );
  });
});

describe("the reconnect catch-up sweep", () => {
  it("leaves a known address alone: no event is ever about it", () => {
    queryClient.setQueryData(queryKeys.assistant(PERSONAL), handle("a551p"));
    queryClient.setQueryData(["activity", "Personal/Maya"], []);

    queryClient.invalidateQueries({
      predicate: (q) => !heldOutOfCatchUpSweep(q),
    });

    const state = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated;
    assert.strictEqual(state(queryKeys.assistant(PERSONAL)), false);
    assert.strictEqual(state(["activity", "Personal/Maya"]), true);
  });

  it("asks again for an address it never got", async () => {
    await failDiscovery(PERSONAL);

    queryClient.invalidateQueries({
      predicate: (q) => !heldOutOfCatchUpSweep(q),
    });

    assert.strictEqual(
      queryClient.getQueryState(queryKeys.assistant(PERSONAL))?.isInvalidated,
      true,
    );
  });

  it("still holds identity and the first-run flags out", () => {
    queryClient.setQueryData(["session"], { uid: "u1" });
    queryClient.setQueryData(["onboarding-pending"], false);

    queryClient.invalidateQueries({
      predicate: (q) => !heldOutOfCatchUpSweep(q),
    });

    assert.strictEqual(
      queryClient.getQueryState(["session"])?.isInvalidated,
      false,
    );
    assert.strictEqual(
      queryClient.getQueryState(["onboarding-pending"])?.isInvalidated,
      false,
    );
  });
});

describe("a membership change", () => {
  it("forgets the address of a space the person is no longer in", () => {
    queryClient.setQueryData(queryKeys.assistant(PERSONAL), handle("a551p"));
    queryClient.setQueryData(queryKeys.assistant(TEAM), handle("a551t"));

    forgetAssistantAddresses(queryClient, [PERSONAL]);

    assert.deepStrictEqual(
      queryClient.getQueryData(queryKeys.assistant(PERSONAL)),
      handle("a551p"),
    );
    assert.strictEqual(
      queryClient.getQueryData(queryKeys.assistant(TEAM)),
      undefined,
    );
  });
});
