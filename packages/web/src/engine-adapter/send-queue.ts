import {
  type ConversationVM,
  conversationScope,
  type QueuedMessageVM,
} from "@houston/sdk";
import type { SessionStartRequest } from "../../../../ui/engine-client/src/types";
import { armSettleWatcher, disarmSettleWatcher } from "./settle-watcher";
import { conversationStore, conversationVm } from "./vm";

/**
 * Queue-while-running: a send that arrives while the conversation's turn is
 * still streaming is HELD (rendered as a removable queued bubble via the VM's
 * `queued` list) and flushed as ONE combined send when the turn settles —
 * several quick follow-ups become a single coherent turn instead of a pile of
 * back-to-back turns.
 *
 * Owned by the adapter (behind the client's `startSession`) so EVERY send path
 * — chat panel, mission control, skills, onboarding — inherits it without each
 * call site re-deriving "is a turn active". The queue holds fully BUILT
 * requests (attachments already saved, prompt final); `queuedPreview` carries
 * the user's words + attachment names for the composer's queued-bubble UI.
 *
 * Flushing has two triggers, because a settle has two shapes: the dispatched
 * turn's own settle (the `.finally` in `chat-send-mixin`), and — for a turn
 * settled by anything else — the settle watcher armed at queue time (see
 * settle-watcher.ts; HOU-718's reconnect auto-continue was the canonical
 * victim of its absence).
 *
 * `autoResume` sends (Houston resuming after a provider reconnect — not
 * user-typed) get special handling: one resume per conversation at a time —
 * a duplicate is swallowed while another is queued OR dispatched-and-running
 * (several reconnect surfaces fire the same resume off one login event) — and
 * a held one is dropped at flush when the user queued their own follow-up
 * (their message resumes the conversation by itself).
 */

interface QueuedSend {
  vm: QueuedMessageVM;
  req: SessionStartRequest;
}

const queues = new Map<string, QueuedSend[]>();
/** Conversations with a DISPATCHED auto-resume turn still in flight. */
const resumesInFlight = new Set<string>();

const queueKey = (agentPath: string, sessionKey: string) =>
  conversationScope(agentPath, sessionKey);

function publishQueued(agentPath: string, sessionKey: string): void {
  const entries = queues.get(queueKey(agentPath, sessionKey)) ?? [];
  conversationVm.setQueued(
    agentPath,
    sessionKey,
    entries.map((e) => e.vm),
  );
}

/** Whether this conversation's VM currently shows a running turn. */
function conversationRunning(agentPath: string, sessionKey: string): boolean {
  const snap = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as ConversationVM | undefined;
  return snap?.running === true;
}

/**
 * Bracket a DISPATCHED auto-resume turn's lifetime: while one is in flight, a
 * duplicate resume (another mounted reconnect card firing off the same login
 * event) is swallowed instead of queued — queueing it would re-send the same
 * "please continue" the moment the first one settles.
 */
export function noteAutoResumeStarted(
  agentPath: string,
  sessionKey: string,
): void {
  resumesInFlight.add(queueKey(agentPath, sessionKey));
}
export function noteAutoResumeEnded(
  agentPath: string,
  sessionKey: string,
): void {
  resumesInFlight.delete(queueKey(agentPath, sessionKey));
}

/**
 * Hold `req` when its conversation has a turn in flight. Returns true when the
 * send was queued (the caller returns without dispatching); false means the
 * conversation is idle and the caller dispatches normally. An `autoResume`
 * send is held at most once per conversation — a duplicate (one already queued
 * or dispatched-and-running) is swallowed, reported as handled.
 */
export function maybeQueueSend(
  agentPath: string,
  req: SessionStartRequest,
  dispatch: (req: SessionStartRequest) => void,
): boolean {
  if (!conversationRunning(agentPath, req.sessionKey)) return false;
  const k = queueKey(agentPath, req.sessionKey);
  const entries = queues.get(k) ?? [];
  if (
    req.autoResume &&
    (resumesInFlight.has(k) || entries.some((e) => e.req.autoResume))
  )
    return true;
  entries.push({
    vm: {
      id: crypto.randomUUID(),
      // Prefer an explicit queued preview, then the display bubble text (a
      // hidden-directive / attachment-path send shows the clean line, never the
      // real prompt), falling back to the prompt when the two are the same.
      text: req.queuedPreview?.text ?? req.displayText ?? req.prompt,
      attachmentNames: req.queuedPreview?.attachmentNames,
    },
    req,
  });
  queues.set(k, entries);
  publishQueued(agentPath, req.sessionKey);
  armSettleWatcher(k, () =>
    flushQueuedSends(agentPath, req.sessionKey, dispatch),
  );
  return true;
}

/** Drop one queued send (the composer's remove affordance). */
export function removeQueuedSend(
  agentPath: string,
  sessionKey: string,
  id: string,
): void {
  const k = queueKey(agentPath, sessionKey);
  const entries = (queues.get(k) ?? []).filter((e) => e.vm.id !== id);
  if (entries.length === 0) {
    queues.delete(k);
    disarmSettleWatcher(k);
  } else queues.set(k, entries);
  publishQueued(agentPath, sessionKey);
}

/**
 * Flush the conversation's queue as ONE combined send once its turn settled.
 * Called from the settle path of every dispatched turn AND from the settle
 * watcher; a no-op when nothing is queued or another turn already took the
 * conversation over. Prompts are trimmed and joined blank-line-separated (the
 * shape the old app-side queue produced); the LAST entry's overrides win (the
 * most recent picker state).
 *
 * A held `autoResume` entry is dropped (not sent) when user-typed entries are
 * queued alongside it: their message resumes the conversation by itself, and
 * combining the marker-tagged resume prompt into their bubble would corrupt it.
 */
export function flushQueuedSends(
  agentPath: string,
  sessionKey: string,
  dispatch: (req: SessionStartRequest) => void,
): void {
  if (conversationRunning(agentPath, sessionKey)) return;
  const k = queueKey(agentPath, sessionKey);
  const all = queues.get(k);
  if (!all || all.length === 0) return;
  const hasUserEntries = all.some((e) => !e.req.autoResume);
  const entries = hasUserEntries ? all.filter((e) => !e.req.autoResume) : all;
  queues.delete(k);
  disarmSettleWatcher(k);
  publishQueued(agentPath, sessionKey);
  const last = entries[entries.length - 1];
  const prompt = entries
    .map((e) => e.req.prompt.trim())
    .filter(Boolean)
    .join("\n\n");
  // Reconstruct the combined BUBBLE the same way as the combined prompt so the
  // history reload matches: each entry contributes what its own bubble showed
  // (`displayText ?? prompt`). Only carried when at least one entry hid its
  // prompt behind a displayText; otherwise the bubble equals the prompt.
  const displayText = entries.some((e) => e.req.displayText !== undefined)
    ? entries
        .map((e) => (e.req.displayText ?? e.req.prompt).trim())
        .filter(Boolean)
        .join("\n\n")
    : undefined;
  dispatch({ ...last.req, prompt, displayText, queuedPreview: undefined });
}
