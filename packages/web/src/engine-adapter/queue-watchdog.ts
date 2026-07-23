import type { ChatMessage } from "@houston/runtime-client";
import { conversationVm } from "./vm";

/**
 * The send queue's LAST-RESORT flush trigger: a periodic ground-truth probe of
 * the conversation's persisted history.
 *
 * A held send normally flushes off the settle watcher, which fires when the
 * VM's `running` flips false — via the dispatched turn's own settle or the
 * passive observer's `confirmIdle` heal. But that whole chain hangs off ONE
 * stream attach, and the attach can die silently: a fatal refusal (the agent
 * moved, an auth hiccup) disposes the observer without healing anything, an
 * exhausted reconnect budget (asleep pod, ~6 min of holds) does the same, and
 * a registry slot held by a hung stream makes the attach a no-op outright.
 * When that happened, the reconnect auto-continue sat "Queued" forever and the
 * agent never resumed (HOU-849).
 *
 * The watchdog is the trigger that cannot die: while anything is queued, poll
 * the conversation's history on a backoff. A trailing ASSISTANT message (or an
 * empty transcript) proves no turn is half-open server-side — a running turn
 * persists its user message first and its reply only at the end — so the
 * `running` flag the queue is waiting on is stale: heal it (`confirmIdle`) and
 * flush. A trailing USER message is inconclusive (a genuinely running turn
 * looks exactly like that), so keep waiting; an unreachable engine just means
 * the next tick retries. Each verdict is judged at tick time, so the watchdog
 * needs no arming-time state beyond its closure.
 */

/** Backoff between probes: quick first check, settling at a gentle idle poll. */
const PROBE_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** True when the server transcript shows no half-open turn. */
const provesIdle = (messages: ChatMessage[]): boolean =>
  messages.length === 0 || messages[messages.length - 1]?.role === "assistant";

/**
 * Arm the watchdog for one conversation's queue. Re-arming while armed is a
 * no-op (the running timer keeps its backoff position). `stillHeld` is read at
 * every tick so a queue emptied by any other path stops the watchdog without a
 * disarm call racing it.
 */
export function armQueueWatchdog(
  scope: string,
  agentPath: string,
  sessionKey: string,
  probe: () => Promise<ChatMessage[]>,
  stillHeld: () => boolean,
  flush: () => void,
): void {
  if (timers.has(scope)) return;
  let attempt = 0;
  const schedule = (): void => {
    const delay =
      PROBE_DELAYS_MS[Math.min(attempt, PROBE_DELAYS_MS.length - 1)] ?? 0;
    attempt++;
    timers.set(
      scope,
      setTimeout(() => {
        void tick();
      }, delay),
    );
  };
  const tick = async (): Promise<void> => {
    timers.delete(scope);
    if (!stillHeld()) return;
    let idle: boolean;
    try {
      idle = provesIdle(await probe());
    } catch {
      // Engine unreachable (waking pod, mid-move gateway): the next tick
      // retries — an unreachable probe must never strand the queue for good.
      if (stillHeld()) schedule();
      return;
    }
    if (!stillHeld()) return;
    if (!idle) {
      // A turn is genuinely half-open server-side — the settle watcher owns
      // the normal flush; keep watching in case ITS trigger dies too.
      schedule();
      return;
    }
    // Server-confirmed idle: heal the stale running flag (publishes running:
    // false, which fires the settle watcher) and flush directly as well —
    // `flushQueuedSends` re-checks the VM and no-ops when already handled.
    conversationVm.confirmIdle(agentPath, sessionKey);
    flush();
    if (stillHeld()) schedule();
  };
  schedule();
}

/** Stop the watchdog for one conversation's queue (flushed or emptied). */
export function disarmQueueWatchdog(scope: string): void {
  const timer = timers.get(scope);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(scope);
}
