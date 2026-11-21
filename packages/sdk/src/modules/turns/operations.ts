import type { ModuleContext } from "../../module-context";
import { type FeedOutput, MultiplexFeedOutput } from "./feed-output";
import { type FeedFrame, historyToFeed } from "./history";
import { resolveModelSettings } from "./model-settings";
import { observeConversation } from "./observe-stream";
import { readPastOwnTurns } from "./read-past-own-turns";
import { type Flight, joinInFlight } from "./single-flight";
import { type StreamRegistry, streamKey } from "./stream-registry";
import type { TurnSendInput } from "./turn-inputs";
import { streamTurn, type TurnWirePin } from "./turn-stream";
import { type ConversationVmOutput, conversationScope } from "./vm-output";

export interface TurnOperationsDeps {
  readonly vm: ConversationVmOutput;
  readonly defaults: readonly FeedOutput[];
  readonly external: Set<FeedOutput>;
  readonly registry: StreamRegistry;
}

export interface TurnOperations {
  send(input: TurnSendInput): Promise<void>;
  observe(conversationId: string, agentId: string): Promise<void>;
  history(conversationId: string, agentId: string): Promise<FeedFrame[]>;
  refreshObserved(agentId?: string): void;
  forgetObserved(conversationId: string, agentId?: string): void;
}

export function createTurnOperations(
  ctx: ModuleContext,
  { vm, defaults, external, registry }: TurnOperationsDeps,
): TurnOperations {
  const observed = new Map<
    string,
    { agentId: string; conversationId: string }
  >();
  const observing = new Map<string, Flight<void>>();
  const send = async (input: TurnSendInput): Promise<void> => {
    const client = ctx.clientFor(input.agentId ?? "");
    let pin: TurnWirePin | undefined;
    if (
      input.model !== undefined ||
      input.effort !== undefined ||
      input.mode !== undefined
    ) {
      const resolved = await resolveModelSettings(
        client,
        input.model,
        input.effort,
        input.mode,
      );
      pin = {
        provider: resolved.activeProvider,
        model: resolved.model,
        effort: resolved.effort,
        mode: resolved.mode,
      };
    }
    const output = new MultiplexFeedOutput([...defaults, ...external]);
    void streamTurn(
      client,
      input.agentId ?? "",
      input.conversationId,
      input.text,
      output,
      registry,
      {
        nonce: input.nonce,
        provider: pin?.provider,
        pin,
        author: input.author,
        mentions: input.mentions,
        grants: input.grants,
      },
    );
  };

  /**
   * Watches a chat that is already running, so its messages keep arriving.
   *
   * Passively attach to a conversation with a turn started elsewhere (another
   * client) or before a reload — observer mode. Loads history, folds it, and
   * SEEDS the conversation VM's feed FIRST so a client opening the chat sees
   * the full transcript immediately — THEN attaches {@link observeConversation}
   * into the SAME VM the `send` path uses, so an in-flight turn keeps rendering
   * live. History also seeds the legacy settle guard (`messages.length`). An
   * idle conversation self-closes; a no-op if the conversation is already
   * streamed here — in which case we DON'T re-seed (that live feed already owns
   * the VM), which is the double-render guard.
   * @assistant group:chat
   * @assistant hidden: it attaches a live stream into the caller's own view of the chat; dispatched on its own it would stream into nothing.
   */
  const observe = async (
    conversationId: string,
    agentId: string,
  ): Promise<void> => {
    const client = ctx.clientFor(agentId);
    const key = streamKey(agentId, conversationId);
    observed.set(key, { agentId, conversationId });
    return joinInFlight(observing, key, async () => {
      const { value, mark } = await readPastOwnTurns(registry, key, () =>
        client.getHistory(conversationId),
      );
      if (mark === null) return;
      const { messages } = value;
      const output = new MultiplexFeedOutput([...defaults, ...external]);
      if (!registry.get(key) && registry.turnsStarted(key) === mark)
        vm.seedHistory(agentId, conversationId, historyToFeed(messages));
      observeConversation(
        client,
        agentId,
        conversationId,
        output,
        messages.length,
        registry,
      );
    });
  };

  /**
   * Reads back everything said in one chat.
   *
   * Read-only: fold a conversation's persisted transcript into feed frames (the
   * same fold `observe` seeds the VM with). The `turns/history` command surfaces
   * it to a caller that wants the transcript without attaching a stream.
   * @param conversationId The chat to read.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @assistant group:chat
   * @assistant unschematized: a replayed message carries the runtime's own frame payloads, which differ per frame type.
   */
  const history = async (
    conversationId: string,
    agentId: string,
  ): Promise<FeedFrame[]> => {
    const { messages } = await ctx
      .clientFor(agentId)
      .getHistory(conversationId);
    return historyToFeed(messages);
  };

  const forgetObserved = (conversationId: string, agentId?: string): void => {
    observed.delete(streamKey(agentId ?? "", conversationId));
  };

  const refreshObserved = (agentId?: string): void => {
    for (const [key, ref] of observed) {
      if (agentId !== undefined && ref.agentId !== agentId) continue;
      if (
        !ctx.store.hasSubscribers(
          conversationScope(ref.agentId, ref.conversationId),
        )
      ) {
        observed.delete(key);
        continue;
      }
      void observe(ref.conversationId, ref.agentId).catch((err) =>
        ctx.config.ports.logger.debug("conversation refresh failed", {
          agentId: ref.agentId,
          conversationId: ref.conversationId,
          error: String(err),
        }),
      );
    }
  };

  return { send, observe, history, refreshObserved, forgetObserved };
}
