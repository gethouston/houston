import {
  type ConversationVM,
  conversationScope,
  type QueuedMessageVM,
} from "@houston/sdk";
import type { SessionStartRequest } from "../../../../ui/engine-client/src/types";
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
 */

interface QueuedSend {
  vm: QueuedMessageVM;
  req: SessionStartRequest;
}

const queues = new Map<string, QueuedSend[]>();

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
 * Hold `req` when its conversation has a turn in flight. Returns true when the
 * send was queued (the caller returns without dispatching); false means the
 * conversation is idle and the caller dispatches normally.
 */
export function maybeQueueSend(
  agentPath: string,
  req: SessionStartRequest,
): boolean {
  if (!conversationRunning(agentPath, req.sessionKey)) return false;
  const k = queueKey(agentPath, req.sessionKey);
  const entries = queues.get(k) ?? [];
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
  if (entries.length === 0) queues.delete(k);
  else queues.set(k, entries);
  publishQueued(agentPath, sessionKey);
}

/**
 * Flush the conversation's queue as ONE combined send once its turn settled.
 * Called from the settle path of every dispatched turn; a no-op when nothing
 * is queued or another turn already took the conversation over. Prompts are
 * trimmed and joined blank-line-separated (the shape the old app-side queue
 * produced); the LAST entry's overrides win (the most recent picker state).
 */
export function flushQueuedSends(
  agentPath: string,
  sessionKey: string,
  dispatch: (req: SessionStartRequest) => void,
): void {
  if (conversationRunning(agentPath, sessionKey)) return;
  const k = queueKey(agentPath, sessionKey);
  const entries = queues.get(k);
  if (!entries || entries.length === 0) return;
  queues.delete(k);
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
