import type { ModuleContext } from "../../module-context";
import { type FeedOutput, MultiplexFeedOutput } from "./feed-output";
import { type FeedFrame, historyToFeed } from "./history";
import { resolveModelSettings } from "./model-settings";
import { observeConversation } from "./observe-stream";
import { type StreamRegistry, streamKey } from "./stream-registry";
import type { TurnSendInput } from "./turn-inputs";
import { streamTurn, type TurnWirePin } from "./turn-stream";
import { type ConversationVmOutput, conversationScope } from "./vm-output";

/** The always-on state the four turn operations drive and share. */
export interface TurnOperationsDeps {
  readonly vm: ConversationVmOutput;
  /** The always-on outputs every turn folds into (VM + board persister). */
  readonly defaults: readonly FeedOutput[];
  /** Extra host-attached outputs (see the module's `addOutput`). */
  readonly external: Set<FeedOutput>;
  /** This SDK's own stream set — never a package-global. */
  readonly registry: StreamRegistry;
}

/** The typed turn facade: the SAME functions back the `turns/*` commands. */
export interface TurnOperations {
  send(input: TurnSendInput): Promise<void>;
  observe(conversationId: string, agentId?: string): Promise<void>;
  history(conversationId: string, agentId?: string): Promise<FeedFrame[]>;
  cancel(conversationId: string, agentId?: string): Promise<void>;
  /** Refresh actively subscribed conversations after a global change event. */
  refreshObserved(agentId?: string): void;
  /** Remove one conversation from the global-refresh registry. */
  forgetObserved(conversationId: string, agentId?: string): void;
}

/**
 * Build the four turn operations over the module's shared machinery. Kept out of
 * the module file so the write half of a conversation reads as one unit, JSDoc
 * with the code it documents.
 */
export function createTurnOperations(
  ctx: ModuleContext,
  { vm, defaults, external, registry }: TurnOperationsDeps,
): TurnOperations {
  const observed = new Map<
    string,
    { agentId: string; conversationId: string }
  >();
  /**
   * Start a turn against the agent's sandbox client (`clientFor(agentId)` — the
   * host nests turn/settings routes under `/agents/<id>`). A model/effort pick
   * rides the send as a PER-TURN pin — the model paired with its owning
   * provider (see {@link resolveModelSettings}; the runtime hard-fails a model
   * under the wrong provider). Deliberately NOT a `setSettings` write: a pick
   * for one conversation must never move the agent-wide active provider that
   * every other conversation falls back to (HOU-695). Fires the resumable
   * stream into the composed output; fire-and-forget like the desktop send —
   * progress and settlement flow reactively through the VM.
   */
  const send = async (input: TurnSendInput): Promise<void> => {
    const client = ctx.clientFor(input.agentId ?? "");
    // Resolve the pick's owning provider: it rides the wire pin AND labels the
    // typed reconnect card when the runtime refuses the send as not-connected
    // (the refusal itself can't name a provider — nothing is connected).
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
      { nonce: input.nonce, provider: pin?.provider, pin },
    );
  };

  /**
   * Passively attach to a conversation with a turn started elsewhere (another
   * client) or before a reload — observer mode. Loads history, folds it, and
   * SEEDS the conversation VM's feed FIRST so a mobile client opening the chat
   * sees the full transcript immediately — THEN attaches {@link
   * observeConversation} into the SAME VM the `send` path uses, so an in-flight
   * turn keeps rendering live. History also seeds the legacy settle guard
   * (`messages.length`). An idle conversation self-closes; a no-op if the
   * conversation is already streamed here — in which case we DON'T re-seed
   * (that live feed already owns the VM), which is the double-render guard.
   */
  const observe = async (
    conversationId: string,
    agentId?: string,
  ): Promise<void> => {
    const resolvedAgentId = agentId ?? "";
    const client = ctx.clientFor(resolvedAgentId);
    const key = streamKey(resolvedAgentId, conversationId);
    observed.set(key, { agentId: resolvedAgentId, conversationId });
    const { messages } = await client.getHistory(conversationId);
    const output = new MultiplexFeedOutput([...defaults, ...external]);
    if (!registry.get(key))
      vm.seedHistory(resolvedAgentId, conversationId, historyToFeed(messages));
    observeConversation(
      client,
      resolvedAgentId,
      conversationId,
      output,
      messages.length,
      registry,
    );
  };

  /**
   * Read-only: fold a conversation's persisted transcript into feed frames (the
   * same fold `observe` seeds the VM with). The `turns/history` command surfaces
   * it to a native shell that wants the transcript without attaching a stream.
   */
  const history = async (
    conversationId: string,
    agentId?: string,
  ): Promise<FeedFrame[]> => {
    const { messages } = await ctx
      .clientFor(agentId ?? "")
      .getHistory(conversationId);
    return historyToFeed(messages);
  };

  /** Abort a conversation's in-flight turn in the agent's sandbox. */
  const cancel = async (
    conversationId: string,
    agentId?: string,
  ): Promise<void> => {
    await ctx.clientFor(agentId ?? "").cancel(conversationId);
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

  return {
    send,
    observe,
    history,
    cancel,
    refreshObserved,
    forgetObserved,
  };
}
