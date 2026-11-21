import type { ConversationSummary } from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import { retryComputeRefusals } from "../compute-retry";
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

export function createConversationsModule(ctx: ModuleContext) {
  const { store, clientFor, registerCommand } = ctx;

  const currentVm = (agentId: string): ConversationListVM | undefined =>
    store.getSnapshot(conversationListScope(agentId)) as
      | ConversationListVM
      | undefined;

  const loadSeq = new Map<string, number>();

  const list = (agentId: string): Promise<ConversationSummary[]> =>
    clientFor(agentId).listConversations();

  const loadList = async (agentId: string): Promise<ConversationListVM> => {
    const scope = conversationListScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    const prior = currentVm(agentId);
    store.publish(scope, { loaded: false, items: prior?.items ?? [] });
    const summaries = await list(agentId);
    const vm: ConversationListVM = {
      loaded: true,
      items: summaries.map(toListItem),
    };
    if (loadSeq.get(agentId) === seq) store.publish(scope, vm);
    return vm;
  };

  const rename = (
    agentId: string,
    id: string,
    title: string,
  ): Promise<ConversationListVM> =>
    retryComputeRefusals(ctx.config.ports.clock, () =>
      clientFor(agentId).renameConversation(id, title),
    ).then(() => loadList(agentId));

  const remove = (agentId: string, id: string): Promise<ConversationListVM> =>
    retryComputeRefusals(ctx.config.ports.clock, () =>
      clientFor(agentId).deleteConversation(id),
    ).then(() => loadList(agentId));

  /**
   * Names a chat from what was said in it, in a few words.
   *
   * Runs a one-shot title turn on the agent's runtime over an excerpt — the
   * composer's first message — with no stored conversation of its own. Answers
   * `""` when the model emits nothing, which the caller replaces with its own
   * truncation rather than blocking on a cosmetic value. Current surfaces title
   * a new mission through the send's `missionTitle` instead; this binds the
   * route that clients shipped before it still call.
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
    scope: conversationListScope,
    /**
     * Lists an agent's chats.
     * @param agentId The agent this acts on, by the id listAgents returns. An
     *   agent's name is not its id, so read the id from listAgents first.
     * @assistant group:chat
     */
    list,
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
     * @assistant confirm: irreversible. The chat and everything said in it are gone, and no copy is kept.
     */
    delete: remove,
    suggestTitle,
  };
}
