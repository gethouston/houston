import { conversationScope } from "@houston/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionStartRequest } from "../src/engine-adapter";
import {
  flushQueuedSends,
  maybeQueueSend,
  noteAutoResumeEnded,
  noteAutoResumeStarted,
  removeQueuedSend,
} from "../src/engine-adapter/send-queue";
import { conversationStore, conversationVm } from "../src/engine-adapter/vm";

/**
 * Queue-while-running: sends into a RUNNING conversation are held (visible as
 * VM `queued` entries), flushed as ONE combined send at settle, and removable
 * before they go out. Settling has two triggers — the dispatched turn's own
 * flush call, and the store watcher that fires when the VM's `running` flips
 * false (observer settles, the stale-running heal). Auto-resume sends (a
 * provider-reconnect continue) are deduped and dropped when redundant. The
 * adapter's module-scoped VM is shared across tests, so each case uses its own
 * conversation key.
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
let dispatched: SessionStartRequest[];
const dispatch = (r: SessionStartRequest) => dispatched.push(r);

beforeEach(() => {
  key = `q-${n++}`;
  dispatched = [];
});

const setRunning = (running: boolean) =>
  conversationVm.sessionStatus(AGENT, key, running ? "running" : "completed");

describe("maybeQueueSend", () => {
  it("dispatches immediately when the conversation is idle", () => {
    expect(maybeQueueSend(AGENT, req(key, "hi"), dispatch)).toBe(false);
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
        dispatch,
      ),
    ).toBe(true);
    expect(queuedOf(key)?.map((q) => q.text)).toEqual(["the user's words"]);
  });

  it("holds at most ONE auto-resume per conversation, invisibly", () => {
    setRunning(true);
    const resume = () =>
      req(key, "<!--houston:auto_continue-->\n\ncontinue", {
        autoResume: true,
      });
    expect(maybeQueueSend(AGENT, resume(), dispatch)).toBe(true);
    // A second mounted reconnect card firing the same resume is swallowed:
    // reported as handled, but never held twice.
    expect(maybeQueueSend(AGENT, resume(), dispatch)).toBe(true);
    // A held resume is a hidden system message — it never renders a queued
    // bubble (the flash read as a stuck send, HOU-849).
    expect(queuedOf(key) ?? []).toEqual([]);
    // Exactly one resume flushes at settle.
    setRunning(false);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.autoResume).toBe(true);
  });
});

describe("settle watcher", () => {
  it("flushes when running flips false WITHOUT an explicit flush call", () => {
    // An observed turn's settle (or the SDK's stale-running heal) never passes
    // through the dispatched-turn flush path — the watcher must fire instead.
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "queued behind an observed turn"), dispatch);
    expect(dispatched).toHaveLength(0);

    setRunning(false);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.prompt).toBe("queued behind an observed turn");
    expect(queuedOf(key) ?? []).toEqual([]);
  });

  it("flushes a held auto-resume after the stale-running heal", () => {
    // The reconnect auto-continue queued against a STALE running flag (its
    // stream was torn down without a settle). The heal (`confirmIdle`) flips
    // running false — the resume must go out, or the agent never continues.
    setRunning(true);
    maybeQueueSend(
      AGENT,
      req(key, "<!--houston:auto_continue-->\n\ncontinue", {
        autoResume: true,
      }),
      dispatch,
    );
    conversationVm.confirmIdle(AGENT, key);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.autoResume).toBe(true);
  });
});

describe("flushQueuedSends", () => {
  it("flushes held sends as ONE combined dispatch once idle", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "Wait"), dispatch);
    maybeQueueSend(
      AGENT,
      req(key, "No no, about cars", { model: "m2" }),
      dispatch,
    );
    setRunning(false); // the watcher flushes right here

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.prompt).toBe("Wait\n\nNo no, about cars");
    // The LAST entry's overrides win (the most recent picker state).
    expect(dispatched[0]?.model).toBe("m2");
    expect(queuedOf(key) ?? []).toEqual([]);
  });

  it("stays held while the conversation is still running", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "hold me"), dispatch);

    flushQueuedSends(AGENT, key, dispatch);

    expect(dispatched).toHaveLength(0);
    expect(queuedOf(key)).toHaveLength(1);
  });

  it("drops a held auto-resume when the user queued their own follow-up", () => {
    setRunning(true);
    maybeQueueSend(
      AGENT,
      req(key, "<!--houston:auto_continue-->\n\ncontinue", {
        autoResume: true,
      }),
      dispatch,
    );
    maybeQueueSend(AGENT, req(key, "my own message"), dispatch);
    setRunning(false);

    // The user's message resumes the conversation by itself — the synthetic
    // nudge riding along would read as noise (and its marker would corrupt
    // the combined bubble).
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.prompt).toBe("my own message");
    expect(dispatched[0]?.autoResume).toBeUndefined();
  });

  it("swallows a resume while a dispatched resume is still in flight", () => {
    // Card A's resume dispatched (running, bracketed in flight); card B fires
    // the same resume off the same login event — it must not queue, or it
    // would re-send "please continue" the moment A settles.
    noteAutoResumeStarted(AGENT, key);
    setRunning(true);
    expect(
      maybeQueueSend(
        AGENT,
        req(key, "<!--houston:auto_continue-->\n\ncontinue", {
          autoResume: true,
        }),
        dispatch,
      ),
    ).toBe(true);
    expect(queuedOf(key) ?? []).toEqual([]);
    noteAutoResumeEnded(AGENT, key);
    setRunning(false);
    expect(dispatched).toHaveLength(0);
  });
});

describe("removeQueuedSend", () => {
  it("drops one held send by id and updates the VM", () => {
    setRunning(true);
    maybeQueueSend(AGENT, req(key, "keep me"), dispatch);
    maybeQueueSend(AGENT, req(key, "drop me"), dispatch);
    const drop = queuedOf(key)?.find((q) => q.text === "drop me");
    expect(drop).toBeDefined();

    removeQueuedSend(AGENT, key, drop?.id ?? "");
    expect(queuedOf(key)?.map((q) => q.text)).toEqual(["keep me"]);

    setRunning(false);
    expect(dispatched[0]?.prompt).toBe("keep me");
  });
});
