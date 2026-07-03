/**
 * Conversation-LIST module.
 *
 * Owns one reactive scope per agent, `conversations/<agentId>`, holding a
 * {@link ConversationListVM} — the agent's list of conversations. Writes
 * (rename/delete) refetch the list so the snapshot always reflects the engine.
 *
 * SEAM — history/feed is NOT here. Message transcripts and the derived feed
 * (`getHistory` + `streamEvents`) are owned by the turns/feed module. This
 * module never touches history; it is the LIST only. Keep it that way.
 *
 * SEAM — per-agent client. Protocol v3 nests conversations under agents
 * (`/v1/agents/:id/conversations/*`), while `@houston/runtime-client` speaks the
 * flat runtime shape. The kernel resolves the per-agent client (rooted at
 * `${baseUrl}/agents/<id>`) through {@link ModuleContext.clientFor} — one
 * memoized cache shared with the turns module — so this module never constructs
 * a client itself.
 */

import type { ModuleContext } from "../../module-context";
import { parseDelete, parseRefresh, parseRename } from "./payloads";
import {
  type ConversationListVM,
  conversationListScope,
  toListItem,
} from "./types";

export type { ConversationListItem, ConversationListVM } from "./types";
export { conversationListScope } from "./types";

/**
 * Wire the conversation-list module: register its command handlers and return
 * the typed facade. The facade methods and the bridge (`dispatch`) share ONE
 * code path per operation, so there is no drift between them.
 */
export function createConversationsModule(ctx: ModuleContext) {
  const { store, clientFor, registerCommand } = ctx;

  const currentVm = (agentId: string): ConversationListVM | undefined =>
    store.getSnapshot(conversationListScope(agentId)) as
      | ConversationListVM
      | undefined;

  // Monotonic per-agent request sequence. Loads have no in-flight guard of their
  // own, so concurrent ones (a rename/delete — each ends in a load — racing a
  // manual refresh) would otherwise resolve last-RESPONSE-wins: if the
  // earlier-issued fetch lands later, its pre-mutation rows flush over the fresh
  // snapshot. Stamping each load with the next sequence and publishing only when
  // it is still the newest makes it last-INTENT-wins — a stale late response is
  // dropped, never published.
  const loadSeq = new Map<string, number>();

  /** Fetch the agent's conversations and publish the resulting VM. */
  const loadList = async (agentId: string): Promise<ConversationListVM> => {
    const scope = conversationListScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    // Signal loading while keeping any prior items to avoid a flush-to-empty.
    const prior = currentVm(agentId);
    store.publish(scope, { loaded: false, items: prior?.items ?? [] });
    const summaries = await clientFor(agentId).listConversations();
    const vm: ConversationListVM = {
      loaded: true,
      items: summaries.map(toListItem),
    };
    // Only the newest-issued load may publish; a superseded one is stale.
    if (loadSeq.get(agentId) === seq) store.publish(scope, vm);
    return vm;
  };

  const rename = (
    agentId: string,
    id: string,
    title: string,
  ): Promise<ConversationListVM> =>
    clientFor(agentId)
      .renameConversation(id, title)
      .then(() => loadList(agentId));

  const remove = (agentId: string, id: string): Promise<ConversationListVM> =>
    clientFor(agentId)
      .deleteConversation(id)
      .then(() => loadList(agentId));

  registerCommand("conversations/refresh", (payload) =>
    loadList(parseRefresh(payload).agentId),
  );
  registerCommand("conversations/rename", (payload) => {
    const { agentId, id, title } = parseRename(payload);
    return rename(agentId, id, title);
  });
  registerCommand("conversations/delete", (payload) => {
    const { agentId, id } = parseDelete(payload);
    return remove(agentId, id);
  });

  return {
    /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
    scope: conversationListScope,
    /** Fetch + publish the agent's conversation list. */
    refresh: (agentId: string): Promise<ConversationListVM> =>
      loadList(agentId),
    /** Rename a conversation, then refetch the list. */
    rename,
    /** Delete a conversation, then refetch the list. */
    delete: remove,
  };
}
