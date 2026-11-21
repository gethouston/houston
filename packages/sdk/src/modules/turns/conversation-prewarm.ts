import {
  type ConversationPrewarmAnswer,
  type ConversationPrewarmInput,
  parseConversationPrewarmAnswer,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { httpRequest, moduleScope, SdkHttpError } from "../http";
import { asConversationInput, type TurnConversationInput } from "./turn-inputs";

export class TurnsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "TurnsHttpError");
  }
}

export interface TurnPrewarmInput extends TurnConversationInput {
  input?: ConversationPrewarmInput;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;

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
   * The gateway holds it for about 20 seconds after the latest request (3
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
