import type { ConversationVM } from "@houston/sdk";
import { conversationStore } from "./vm";

/**
 * The send queue's second flush trigger: a per-conversation store subscription
 * that fires `onSettled` the moment the VM's `running` flips false. Needed
 * because a settle has two shapes — a turn THIS client dispatched (its
 * `.finally` flushes directly) and a turn settled by anything else (a passive
 * observer, the SDK's stale-running heal), which never passes through that
 * path. Without this, a send queued against an observed turn sat in the queue
 * forever.
 */

const watchers = new Map<string, () => void>();

/** Arm once per key; re-arming while armed is a no-op. */
export function armSettleWatcher(scope: string, onSettled: () => void): void {
  if (watchers.has(scope)) return;
  const unsub = conversationStore.subscribe(scope, (snapshot) => {
    if ((snapshot as ConversationVM | undefined)?.running === true) return;
    onSettled();
  });
  watchers.set(scope, unsub);
}

export function disarmSettleWatcher(scope: string): void {
  watchers.get(scope)?.();
  watchers.delete(scope);
}
