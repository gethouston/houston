import type { ChatMessage } from "@houston/runtime-client";
import { conversationScope } from "@houston/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStartRequest } from "../src/engine-adapter";
import {
  maybeQueueSend,
  removeQueuedSend,
} from "../src/engine-adapter/send-queue";
import { conversationStore, conversationVm } from "../src/engine-adapter/vm";

/**
 * The queue watchdog (HOU-849): the ground-truth flush trigger for a held send
 * whose settle-watcher chain silently died — a fatal or budget-exhausted
 * observer stream never healed the stale `running` flag, so the reconnect
 * auto-continue sat "Queued" forever. The watchdog probes persisted history on
 * a backoff: a trailing assistant message (or an empty transcript) proves no
 * turn is half-open server-side, so it heals the flag and flushes; a trailing
 * user message means a turn IS half-open, so it keeps waiting; a failed probe
 * retries. Driven through `maybeQueueSend`, the seam the adapter uses.
 */

const AGENT = "Houston/Bo";

const msg = (role: "user" | "assistant", content: string): ChatMessage =>
  ({ role, content }) as ChatMessage;

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
  vi.useFakeTimers();
  key = `wd-${n++}`;
  dispatched = [];
  conversationVm.sessionStatus(AGENT, key, "running");
});

afterEach(() => {
  vi.useRealTimers();
});

const queueResume = (probe: () => Promise<ChatMessage[]>) =>
  maybeQueueSend(
    AGENT,
    req(key, "<!--houston:auto_continue-->\n\ncontinue", { autoResume: true }),
    dispatch,
    probe,
  );

describe("queue watchdog", () => {
  it("flushes a held resume when the probe proves the server is idle", async () => {
    // The observer heal never fires (its stream died silently); history shows
    // the failed turn's persisted reply — no half-open turn server-side.
    queueResume(async () => [msg("user", "hrey"), msg("assistant", "")]);
    expect(dispatched).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.autoResume).toBe(true);
    expect(queuedOf(key) ?? []).toEqual([]);
    // The stale running flag was healed, not bypassed.
    expect(
      (
        conversationStore.getSnapshot(conversationScope(AGENT, key)) as {
          running: boolean;
        }
      ).running,
    ).toBe(false);
  });

  it("keeps holding while the server shows a half-open turn, flushes when it settles", async () => {
    let history = [msg("user", "still running")];
    queueResume(async () => history);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(dispatched).toHaveLength(0);
    expect(queuedOf(key)).toHaveLength(1);

    history = [msg("user", "still running"), msg("assistant", "done now")];
    await vi.advanceTimersByTimeAsync(4_000);
    expect(dispatched).toHaveLength(1);
  });

  it("retries after a failed probe instead of stranding the queue", async () => {
    let calls = 0;
    queueResume(async () => {
      calls++;
      if (calls === 1) throw new Error("engine unreachable");
      return [msg("assistant", "")];
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(dispatched).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(calls).toBe(2);
    expect(dispatched).toHaveLength(1);
  });

  it("treats an empty transcript as idle", async () => {
    queueResume(async () => []);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(dispatched).toHaveLength(1);
  });

  it("stops probing once the queued send is removed by the user", async () => {
    const probe = vi.fn(async () => [msg("assistant", "")]);
    queueResume(probe);
    const id = queuedOf(key)?.[0]?.id ?? "";
    removeQueuedSend(AGENT, key, id);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(0);
  });

  it("stands down when the settle watcher already flushed", async () => {
    const probe = vi.fn(async () => [msg("assistant", "")]);
    queueResume(probe);
    // The normal trigger fires first (observer heal / turn settle).
    conversationVm.confirmIdle(AGENT, key);
    expect(dispatched).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(1);
  });
});
