import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { surfaceAgentThenRefresh } from "../src/components/onboarding/first-run-provision.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("surfaceAgentThenRefresh", () => {
  it("resolves and surfaces the agent WITHOUT waiting on the background refresh", async () => {
    const events: string[] = [];
    let releaseRefresh: () => void = () => {};
    const refreshDone = new Promise<void>((r) => {
      releaseRefresh = r;
    });
    let surfaced: { id: string } | null = null;

    const agent = await surfaceAgentThenRefresh<{ id: string }>(
      async () => {
        events.push("created");
        return { id: "a1" };
      },
      (a) => {
        surfaced = a;
        events.push("surfaced");
      },
      async () => {
        events.push("refresh-start");
        await refreshDone;
        events.push("refresh-done");
      },
      () => events.push("refresh-error"),
    );

    // The call returned before the refresh settled — the pod cold-start (modeled
    // by the still-pending refreshDone) never gated it.
    deepStrictEqual(events, ["created", "surfaced", "refresh-start"]);
    strictEqual(agent.id, "a1");
    strictEqual(surfaced?.id, "a1");

    // The refresh still finishes in the background afterwards.
    releaseRefresh();
    await refreshDone;
    await tick();
    strictEqual(events.includes("refresh-done"), true);
  });

  it("surfaces the agent even when the background refresh rejects, routing the error out", async () => {
    const errors: unknown[] = [];
    let surfaced = false;

    const agent = await surfaceAgentThenRefresh<{ id: string }>(
      async () => ({ id: "b2" }),
      () => {
        surfaced = true;
      },
      async () => {
        throw new Error("cold pod");
      },
      (e) => errors.push(e),
    );

    strictEqual(agent.id, "b2");
    strictEqual(surfaced, true);
    // The rejected background refresh must not surface as an unhandled rejection;
    // it lands on onRefreshError instead.
    await tick();
    strictEqual(errors.length, 1);
    strictEqual((errors[0] as Error).message, "cold pod");
  });

  it("propagates a create() failure and never surfaces or refreshes", async () => {
    const events: string[] = [];
    try {
      await surfaceAgentThenRefresh<{ id: string }>(
        async () => {
          throw new Error("create failed");
        },
        () => events.push("surfaced"),
        async () => events.push("refresh"),
        () => events.push("refresh-error"),
      );
      events.push("resolved");
    } catch (e) {
      events.push(`threw:${(e as Error).message}`);
    }
    deepStrictEqual(events, ["threw:create failed"]);
  });
});
