/**
 * Turn → board-status contract (the SDK-only / iOS path).
 *
 * On web/desktop the engine-adapter attaches a bus FeedOutput that PATCHes the
 * persisted activity when a turn settles. The SDK turns module ships its OWN
 * default output that must do the same, so a native shell (iOS) that never calls
 * `addOutput` still sees a mission leave "running" when its turn finishes.
 *
 * These drive `sdk.turns.send` against an activity-keyed conversation and assert
 * the persisted `Activity` record (read straight off the host) transitions
 * running → needs_you — the write the SDK path historically dropped, leaving
 * mission lists stuck on "running" forever.
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import type { Activity } from "@houston/protocol";
import { activitiesScope, type SdkLogger } from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  control,
  convVm,
  type Harness,
  makeSdk,
  resetHost,
  startHost,
  until,
  untilAsync,
} from "./harness";

let host: FakeHost;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness;
beforeEach(async () => {
  await resetHost(host.url);
  h = makeSdk(host.url);
});
afterEach(() => {
  h.sdk.dispose();
});

/** Read an activity's status straight off the host (independent of any VM). */
async function hostStatus(id: string): Promise<string | undefined> {
  const res = await fetch(`${host.url}/agents/${SEED_AGENT_ID}/activities`);
  const { items } = (await res.json()) as { items: Activity[] };
  return items.find((a) => a.id === id)?.status;
}

describe("SDK turn settle → activity board status", () => {
  it("PATCHes the activity to needs_you when the turn settles", async () => {
    // Seed act-2 starts life "done"; a fresh turn on its chat must move it.
    const cid = "activity-act-2";
    expect(await hostStatus("act-2")).toBe("done");

    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => convVm(h.sdk, cid)?.running === false, "turn settled");

    // The persisted record PATCHed to needs_you (the write the SDK path dropped).
    await untilAsync(
      async () => (await hostStatus("act-2")) === "needs_you",
      "activity persisted to needs_you",
    );
  });

  it("flips the activity to running in flight, then needs_you on settle", async () => {
    await control(host.url, "chat-config", { replyDelayMs: 60 });
    const cid = "activity-act-2";
    expect(await hostStatus("act-2")).toBe("done");

    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });

    // Start-of-turn persist flips a done/needs_you card back to running.
    await untilAsync(
      async () => (await hostStatus("act-2")) === "running",
      "activity running in flight",
    );
    await untilAsync(
      async () => (await hostStatus("act-2")) === "needs_you",
      "activity settled to needs_you",
    );
  });

  it("reflects the settled status in the activities/<agentId> VM", async () => {
    const cid = "activity-act-2";
    await h.sdk.activities.refresh(SEED_AGENT_ID);
    await until(
      () =>
        (
          h.sdk.getSnapshot(activitiesScope(SEED_AGENT_ID)) as
            | { loaded: boolean; items: { id: string; status: string }[] }
            | undefined
        )?.loaded === true,
      "activities loaded",
    );

    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => convVm(h.sdk, cid)?.running === false, "turn settled");

    await until(() => {
      const snap = h.sdk.getSnapshot(activitiesScope(SEED_AGENT_ID)) as
        | { items: { id: string; status: string }[] }
        | undefined;
      return snap?.items.find((a) => a.id === "act-2")?.status === "needs_you";
    }, "activities VM reflects needs_you");
  });

  it("logs a warning and does not crash when no activity matches the chat", async () => {
    const warnings: string[] = [];
    const logger: SdkLogger = {
      debug: () => {},
      info: () => {},
      warn: (msg) => warnings.push(msg),
      error: () => {},
    };
    const solo = makeSdk(host.url, logger);
    try {
      const cid = "c-no-activity"; // a plain chat, not an activity session key
      await solo.sdk.turns.send({
        agentId: SEED_AGENT_ID,
        conversationId: cid,
        text: "Ping",
      });
      // The turn still settles cleanly — a missing board card never crashes it.
      await until(
        () => convVm(solo.sdk, cid)?.running === false,
        "turn settled despite no activity",
      );
      expect(warnings.some((w) => w.includes("no activity"))).toBe(true);
    } finally {
      solo.sdk.dispose();
    }
  });
});
