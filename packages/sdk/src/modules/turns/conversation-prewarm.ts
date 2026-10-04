/**
 * Readying the sandbox a person's next send in one chat runs in, while they
 * are still typing it. Hosted only: the gateway serves the route where
 * `Capabilities.conversationPrewarm` is true, and when to ask is the typing
 * policy's call (`draft-prewarm.ts`).
 *
 * A gateway control route (`/v1/agents/…`), not an agent-proxy path: the
 * prewarm never reaches the agent's runtime, so it rides the module HTTP seam
 * instead of the runtime client the other conversation controls use.
 */

import {
  type ConversationPrewarmAnswer,
  type ConversationPrewarmInput,
  parseConversationPrewarmAnswer,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { httpRequest, moduleScope, SdkHttpError } from "../http";
import { asConversationInput, type TurnConversationInput } from "./turn-inputs";

/** A non-2xx from a turns route the module reaches over the HTTP seam. */
export class TurnsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "TurnsHttpError");
  }
}

/** The `turns/prewarm` command payload. */
export interface TurnPrewarmInput extends TurnConversationInput {
  /** The provider and model the composer would send with. */
  input?: ConversationPrewarmInput;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;

/** Untrusted-envelope guard for `turns/prewarm`. A pin field that is not a
 *  non-empty string drops out, so the gateway resolves it as a send would. */
export function asPrewarmInput(payload: unknown): TurnPrewarmInput {
  const ref = asConversationInput(payload, "turns/prewarm");
  const raw = (payload as { input?: unknown }).input;
  if (raw === undefined) return ref;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("turns/prewarm input must be an object");
  const pin = raw as Record<string, unknown>;
  const provider = str(pin.provider);
  const model = str(pin.model);
  return {
    ...ref,
    input: {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    },
  };
}

export function createConversationPrewarm(ctx: ModuleContext) {
  const scope = moduleScope(ctx, "turns", TurnsHttpError);

  /**
   * Readies the sandbox the person's next message in one chat will run in.
   *
   * The gateway holds it for about 30 seconds after the latest request (3
   * minutes at most), for this person's next send in this chat alone. Asking
   * again extends the hold and never starts a second sandbox. Every outcome,
   * `skipped` included, answers 202.
   * @param conversationId The chat the person is typing in. A new chat's id is
   *   the one its first send will use.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @param input The provider and model the composer would send with.
   * @assistant group:chat
   * @assistant hidden: it readies a sandbox for a message the person is typing in the chat they have open; the assistant never types in a composer.
   */
  const prewarm = async (
    conversationId: string,
    agentId: string,
    input: ConversationPrewarmInput = {},
  ): Promise<ConversationPrewarmAnswer> => {
    const res = await httpRequest(
      scope,
      `/v1/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}/prewarm`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return parseConversationPrewarmAnswer(await res.json());
  };

  ctx.registerCommand("turns/prewarm", (payload) => {
    const ref = asPrewarmInput(payload);
    return prewarm(ref.conversationId, ref.agentId, ref.input);
  });

  return { prewarm };
}
