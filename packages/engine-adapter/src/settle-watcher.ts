import type { ConversationVM } from "@houston/sdk";
import { conversationStore } from "./vm";

const watchers = new Map<string, () => void>();

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
