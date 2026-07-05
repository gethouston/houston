import { conversationScope } from "@houston/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionStartRequest } from "../src/engine-adapter";
import {
  flushQueuedSends,
  maybeQueueSend,
  removeQueuedSend,
} from "../src/engine-adapter/send-queue";
import { conversationStore, conversationVm } from "../src/engine-adapter/vm";

/**
 * Queue-while-running: sends into a RUNNING conversation are held (visible as
 * VM `queued` entries), flushed as ONE combined send at settle, and removable
 * before they go out. The adapter's module-scoped VM is shared across tests,
 * so each case uses its own conversation key.
 */

const AGENT = "Houston/Bo";

const req = (
  sessionKey: string,
  prompt: string,
  extra: Partial<SessionStartRequest> = {},
): SessionStartRequest => ({ sessionKey, prompt, ...extra });

const queuedOf = (sessionKey: string) =>
  (
    conversationStore.getSnapshot(conversationScope(AGENT, sessionKey)) as
      | { queued?: { id: string; text: string }[] }
      | undefined
  )?.queued;

let n = 0;
let key: string;
beforeEach(() => {
  key = `q-${n++}`;
});

const setRunning = (running: boolean) =>
  conversationVm.sessionStatus(AGENT, key, running ? "running" : "completed");

describe("maybeQueueSend", () => {
  it("dispatches immediately when the conversation is idle", () => {
    expect(maybeQueueSend(AGENT, req(key, "hi"))).toBe(false);
    expect(queuedOf(key)).toBeUndefined();
  });

  it("holds a send while a turn runs, showing the preview text", () => {
    setRunning(true);
    expect(
      maybeQueueSend(
        AGENT,
        req(key, "<!--marker-->built prompt", {
          queuedPreview: { text: "the user's words" },
        }),
      ),
    ).toBe(true);
    expect(queuedOf(key)?.map((q) => q.text)).toEqual(["the user's words"]);
  });
});

describe("flushQueuedSends", () => {
  it("flushes held sends as ONE combined dispatch once idle", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "Wait"));
    maybeQueueSend(AGENT, req(key, "No no, about cars", { model: "m2" }));
    setRunning(false);

    const dispatched: SessionStartRequest[] = [];
    flushQueuedSends(AGENT, key, (r) => dispatched.push(r));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.prompt).toBe("Wait\n\nNo no, about cars");
    // The LAST entry's overrides win (the most recent picker state).
    expect(dispatched[0]?.model).toBe("m2");
    expect(queuedOf(key) ?? []).toEqual([]);
  });

  it("stays held while the conversation is still running", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "hold me"));

    const dispatched: SessionStartRequest[] = [];
    flushQueuedSends(AGENT, key, (r) => dispatched.push(r));

    expect(dispatched).toHaveLength(0);
    expect(queuedOf(key)).toHaveLength(1);
  });
});

describe("removeQueuedSend", () => {
  it("drops one held send by id and updates the VM", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "keep me"));
    maybeQueueSend(AGENT, req(key, "drop me"));
    const drop = queuedOf(key)?.find((q) => q.text === "drop me");
    expect(drop).toBeDefined();

    removeQueuedSend(AGENT, key, drop?.id ?? "");
    expect(queuedOf(key)?.map((q) => q.text)).toEqual(["keep me"]);

    setRunning(false);
    const dispatched: SessionStartRequest[] = [];
    flushQueuedSends(AGENT, key, (r) => dispatched.push(r));
    expect(dispatched[0]?.prompt).toBe("keep me");
  });
});
