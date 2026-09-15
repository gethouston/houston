import { ConversationVmOutput, ScopeStore } from "@houston/sdk";

/**
 * The adapter's ONE reactive scope store — the read side of every turn. The
 * app binds it with `useSdkSnapshot(conversationStore, conversationScope(…))`;
 * the write side is {@link conversationVm}, multiplexed into every turn and
 * observer stream in `turn-stream.ts`.
 *
 * Module-scoped on purpose (like the adapter's StreamRegistry): the single
 * adapter is the desktop's composition root for engine access, so its store is
 * the one place a conversation's VM lives.
 */
export const conversationStore = new ScopeStore();

/** The SDK's built-in VM fold, publishing into {@link conversationStore}. */
export const conversationVm = new ConversationVmOutput(conversationStore);
