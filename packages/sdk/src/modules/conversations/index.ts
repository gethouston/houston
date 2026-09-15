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

import type { ConversationSummary } from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import {
  parseDelete,
  parseRefresh,
  parseRename,
  parseSuggestTitle,
} from "./payloads";
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

  /**
   * Lists an agent's chats.
   *
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @assistant group:chat
   */
  const list = (agentId: string): Promise<ConversationSummary[]> =>
    clientFor(agentId).listConversations();

  /** Fetch the agent's conversations and publish the resulting VM. */
  const loadList = async (agentId: string): Promise<ConversationListVM> => {
    const scope = conversationListScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    // Signal loading while keeping any prior items to avoid a flush-to-empty.
    const prior = currentVm(agentId);
    store.publish(scope, { loaded: false, items: prior?.items ?? [] });
    const summaries = await list(agentId);
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

  /**
   * Names a chat from what was said in it, in a few words.
   *
   * Runs a one-shot title turn on the agent's runtime over an excerpt — the
   * composer's first message — with no stored conversation of its own. Answers
   * `""` when the model emits nothing, which the caller replaces with its own
   * truncation rather than blocking on a cosmetic value.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @param text The excerpt to title.
   * @assistant group:chat
   * @assistant hidden: it spends a model turn naming a chat the person is in the middle of starting; the title they end up with is theirs to set.
   */
  const suggestTitle = (
    agentId: string,
    text: string,
  ): Promise<{ title: string }> => clientFor(agentId).summarizeText(text);

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
  registerCommand("conversations/suggestTitle", (payload) => {
    const { agentId, text } = parseSuggestTitle(payload);
    return suggestTitle(agentId, text);
  });

  return {
    /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
    scope: conversationListScope,
    list,
    /** Fetch + publish the agent's conversation list. */
    refresh: (agentId: string): Promise<ConversationListVM> =>
      loadList(agentId),
    /**
     * Retitles one of an agent's chats.
     * @param agentId The agent this acts on, by the id listAgents returns. An
     *   agent's name is not its id, so read the id from listAgents first.
     * @param id The chat to retitle.
     * @param title The new title.
     * @assistant group:chat
     * @assistant unconfirmed: Retitles a chat; everything said in it is untouched, and the title is changed back the same way.
     */
    rename,
    /**
     * Deletes one of an agent's chats, with everything said in it.
     * @param agentId The agent this acts on, by the id listAgents returns. An
     *   agent's name is not its id, so read the id from listAgents first.
     * @param id The chat to delete.
     * @assistant group:chat
     * @assistant confirm: irreversible. The chat and everything said in it are gone, and Houston keeps no copy.
     */
    delete: remove,
    suggestTitle,
  };
}
