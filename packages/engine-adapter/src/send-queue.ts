import { isAutoContinue } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { conversationScope, type QueuedMessageVM } from "@houston/sdk";
import {
  decodeCitationsEnvelopes,
  type SessionStartRequest,
} from "@houston/wire-types";
import { conversationBusy } from "./conversation-busy";
import { armQueueWatchdog, disarmQueueWatchdog } from "./queue-watchdog";
import { mergeSendFields } from "./send-queue-merge";
import { armSettleWatcher, disarmSettleWatcher } from "./settle-watcher";
import { conversationVm } from "./vm";

interface QueuedSend {
  vm: QueuedMessageVM;
  req: SessionStartRequest;
}

const queues = new Map<string, QueuedSend[]>();
const resumesInFlight = new Set<string>();

const queueKey = (agentPath: string, sessionKey: string) =>
  conversationScope(agentPath, sessionKey);

function publishQueued(agentPath: string, sessionKey: string): void {
  const entries = queues.get(queueKey(agentPath, sessionKey)) ?? [];
  conversationVm.setQueued(
    agentPath,
    sessionKey,
    entries
      .filter((e) => !e.req.autoResume && !isAutoContinue(e.req.prompt))
      .map((e) => e.vm),
  );
}

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

export function maybeQueueSend(
  agentPath: string,
  req: SessionStartRequest,
  dispatch: (req: SessionStartRequest) => void,
  probe?: () => Promise<ChatMessage[]>,
): boolean {
  if (!conversationBusy(agentPath, req.sessionKey)) return false;
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
      text: queuedText(
        req.queuedPreview?.text ?? req.displayText ?? req.prompt,
      ),
      attachmentNames: req.queuedPreview?.attachmentNames,
    },
    req,
  });
  queues.set(k, entries);
  publishQueued(agentPath, req.sessionKey);
  const flush = () => flushQueuedSends(agentPath, req.sessionKey, dispatch);
  armSettleWatcher(k, flush);
  if (probe)
    armQueueWatchdog(
      k,
      agentPath,
      req.sessionKey,
      probe,
      () => queues.has(k),
      flush,
      req.autoResume === true,
    );
  return true;
}

export function removeQueuedSend(
  agentPath: string,
  sessionKey: string,
  id: string,
): SessionStartRequest | undefined {
  const k = queueKey(agentPath, sessionKey);
  const all = queues.get(k) ?? [];
  const removed = all.find((e) => e.vm.id === id)?.req;
  const entries = all.filter((e) => e.vm.id !== id);
  if (entries.length === 0) {
    queues.delete(k);
    disarmSettleWatcher(k);
    disarmQueueWatchdog(k);
  } else queues.set(k, entries);
  publishQueued(agentPath, sessionKey);
  return removed;
}

export function flushQueuedSends(
  agentPath: string,
  sessionKey: string,
  dispatch: (req: SessionStartRequest) => void,
): void {
  if (conversationBusy(agentPath, sessionKey)) return;
  const k = queueKey(agentPath, sessionKey);
  const all = queues.get(k);
  if (!all || all.length === 0) return;
  const hasUserEntries = all.some((e) => !e.req.autoResume);
  const entries = hasUserEntries ? all.filter((e) => !e.req.autoResume) : all;
  queues.delete(k);
  disarmSettleWatcher(k);
  disarmQueueWatchdog(k);
  publishQueued(agentPath, sessionKey);
  const last = entries[entries.length - 1];
  dispatch({
    ...last.req,
    ...mergeSendFields(entries.map((e) => e.req)),
    queuedPreview: undefined,
  });
}

function queuedText(shown: string): string {
  const cited = decodeCitationsEnvelopes(shown);
  if (!cited) return shown;
  return (
    cited.text ||
    cited.citations.map((c) => c.comment || c.quote || "").join(" · ")
  );
}
