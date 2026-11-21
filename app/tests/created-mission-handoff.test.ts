import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CREATED_MISSION_HANDOFF_TTL_MS,
  CreatedMissionHandoff,
} from "../src/lib/created-mission-handoff.ts";

const mission = (activityId: string) => ({
  activityId,
  agentPath: `/w/${activityId}`,
  sessionKey: `activity-${activityId}`,
});

function harness(start = 1_000) {
  let clock = start;
  const handoff = new CreatedMissionHandoff({ now: () => clock });
  return { handoff, advance: (ms: number) => (clock += ms) };
}

describe("CreatedMissionHandoff", () => {
  it("hands the published mission to the board that reads it", () => {
    const { handoff } = harness();
    handoff.publish(mission("m1"));
    strictEqual(handoff.read()?.activityId, "m1");
  });

  it("serves every kept-alive board, not just the first one to look", () => {
    const { handoff } = harness();
    handoff.publish(mission("m1"));
    strictEqual(handoff.read()?.activityId, "m1");
    strictEqual(handoff.read()?.activityId, "m1");
  });

  it("reads back the same object, so adopting twice is not a re-render", () => {
    const { handoff } = harness();
    handoff.publish(mission("m1"));
    strictEqual(handoff.read(), handoff.read());
  });

  it("expires, so a mission no board ever opened can't poison a later create", () => {
    const { handoff, advance } = harness();
    handoff.publish(mission("orphan"));
    advance(CREATED_MISSION_HANDOFF_TTL_MS);
    strictEqual(handoff.read(), null);
    advance(-CREATED_MISSION_HANDOFF_TTL_MS);
    strictEqual(handoff.read(), null);
  });

  it("keeps a mission published within the window", () => {
    const { handoff, advance } = harness();
    handoff.publish(mission("m1"));
    advance(CREATED_MISSION_HANDOFF_TTL_MS - 1);
    strictEqual(handoff.read()?.activityId, "m1");
  });

  it("serves the newest publish — one create is in flight at a time", () => {
    const { handoff } = harness();
    handoff.publish(mission("m1"));
    handoff.publish(mission("m2"));
    strictEqual(handoff.read()?.activityId, "m2");
  });

  it("notifies a board that mounted before the publish", () => {
    const { handoff } = harness();
    let adopted: string | null = null;
    handoff.subscribe(() => {
      adopted = handoff.read()?.activityId ?? null;
    });
    handoff.publish(mission("m1"));
    strictEqual(adopted, "m1");
  });

  it("notifies every subscribed board", () => {
    const { handoff } = harness();
    let calls = 0;
    handoff.subscribe(() => calls++);
    handoff.subscribe(() => calls++);
    handoff.publish(mission("m1"));
    strictEqual(calls, 2);
  });

  it("stops notifying an unsubscribed board", () => {
    const { handoff } = harness();
    let calls = 0;
    const unsubscribe = handoff.subscribe(() => calls++);
    unsubscribe();
    handoff.publish(mission("m1"));
    strictEqual(calls, 0);
    strictEqual(handoff.read()?.activityId, "m1");
  });

  it("reads nothing when nothing was published", () => {
    strictEqual(harness().handoff.read(), null);
  });
});
