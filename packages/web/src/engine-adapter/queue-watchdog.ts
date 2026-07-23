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
/** An `immediate` arm probes NOW, then falls onto the normal backoff — the
 *  reconnect auto-resume's cadence: a stale hold must clear within one
 *  round-trip, not after a visible pause. */
const IMMEDIATE_DELAYS_MS = [0, ...PROBE_DELAYS_MS];

/** One live watchdog per scope. The session OBJECT is the arm's identity: a
 *  tick that resumes after an await reschedules only while its own session
 *  still owns the scope, so a disarm-then-rearm racing an in-flight probe can
 *  never leave two probe chains running for one conversation. */
interface WatchdogSession {
  timer?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, WatchdogSession>();

/** True when the server transcript shows no half-open turn. */
const provesIdle = (messages: ChatMessage[]): boolean =>
  messages.length === 0 || messages[messages.length - 1]?.role === "assistant";

/**
 * Arm the watchdog for one conversation's queue. Re-arming while armed is a
 * no-op (the running chain keeps its backoff position). `stillHeld` is read at
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
  /** Probe immediately instead of after the first backoff step — for holds
   *  that should clear within one round-trip (the reconnect auto-resume). */
  immediate = false,
): void {
  if (sessions.has(scope)) return;
  const session: WatchdogSession = {};
  sessions.set(scope, session);
  const delays = immediate ? IMMEDIATE_DELAYS_MS : PROBE_DELAYS_MS;
  let attempt = 0;
  const owns = (): boolean => sessions.get(scope) === session;
  const schedule = (): void => {
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
    attempt++;
    session.timer = setTimeout(() => {
      void tick();
    }, delay);
  };
  const tick = async (): Promise<void> => {
    if (!owns()) return;
    if (!stillHeld()) {
      sessions.delete(scope);
      return;
    }
    let idle: boolean;
    try {
      idle = provesIdle(await probe());
    } catch {
      // Engine unreachable (waking pod, mid-move gateway): the next tick
      // retries — an unreachable probe must never strand the queue for good.
      if (owns()) schedule();
      return;
    }
    if (!owns()) return;
    if (!stillHeld()) {
      sessions.delete(scope);
      return;
    }
    if (!idle) {
      // A turn is genuinely half-open server-side — the settle watcher owns
      // the normal flush; keep watching in case ITS trigger dies too.
      schedule();
      return;
    }
    // Server-confirmed idle: heal the stale running flag (publishes running:
    // false, which fires the settle watcher) and flush directly as well —
    // `flushQueuedSends` re-checks the VM and no-ops when already handled.
    // The flush disarms this watchdog via `disarmQueueWatchdog`.
    conversationVm.confirmIdle(agentPath, sessionKey);
    flush();
    if (owns() && stillHeld()) schedule();
  };
  schedule();
}

/** Stop the watchdog for one conversation's queue (flushed or emptied). */
export function disarmQueueWatchdog(scope: string): void {
  const session = sessions.get(scope);
  if (!session) return;
  if (session.timer !== undefined) clearTimeout(session.timer);
  sessions.delete(scope);
}
