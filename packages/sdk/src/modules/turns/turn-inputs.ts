import {
  type ConversationImportRequest,
  type GrantableOperation,
  MessageGrantsSchema,
  parseConversationImportRequest,
  parseMentions,
} from "@houston/protocol";
import type { FeedAuthor, FeedMention } from "./vm-output";

export interface TurnSendInput {
  agentId?: string;
  conversationId: string;
  text: string;
  nonce?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
  author?: FeedAuthor;
  mentions?: FeedMention[];
  grants?: GrantableOperation[];
}

export interface TurnConversationInput {
  agentId: string;
  conversationId: string;
}

export interface TurnSetModeInput extends TurnConversationInput {
  mode: "execute" | "plan" | "auto";
}

export interface TurnTruncateInput extends TurnConversationInput {
  turnId: string;
}

export interface TurnImportInput extends TurnConversationInput {
  request: ConversationImportRequest;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const mode = (v: unknown): "execute" | "plan" | "auto" | undefined =>
  v === "execute" || v === "plan" || v === "auto" ? v : undefined;

const author = (v: unknown): FeedAuthor | undefined => {
  const a = v as { userId?: unknown; name?: unknown } | null | undefined;
  if (!a || typeof a.userId !== "string" || a.userId === "") return undefined;
  return {
    userId: a.userId,
    ...(typeof a.name === "string" ? { name: a.name } : {}),
  };
};

const mentions = (v: unknown): FeedMention[] | undefined => parseMentions(v);

export function asSendInput(payload: unknown): TurnSendInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.conversationId !== "string" || typeof p.text !== "string")
    throw new Error("turns/send requires string conversationId and text");
  return {
    conversationId: p.conversationId,
    text: p.text,
    agentId: str(p.agentId),
    nonce: str(p.nonce),
    model: str(p.model),
    effort: str(p.effort),
    mode: mode(p.mode),
    author: author(p.author),
    mentions: mentions(p.mentions),
    grants:
      p.grants === undefined ? undefined : MessageGrantsSchema.parse(p.grants),
  };
}

export function asConversationInput(
  payload: unknown,
  command: string,
): TurnConversationInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.conversationId !== "string" || typeof p.agentId !== "string")
    throw new Error(`${command} requires string agentId and conversationId`);
  return { agentId: p.agentId, conversationId: p.conversationId };
}

export function asSetModeInput(payload: unknown): TurnSetModeInput {
  const picked = mode((payload as { mode?: unknown })?.mode);
  if (!picked) throw new Error("turns/setMode requires a known mode");
  return { ...asConversationInput(payload, "turns/setMode"), mode: picked };
}

export function asTruncateInput(payload: unknown): TurnTruncateInput {
  const turnId = str((payload as { turnId?: unknown })?.turnId);
  if (turnId === undefined)
    throw new Error("turns/truncate requires a string turnId");
  return { ...asConversationInput(payload, "turns/truncate"), turnId };
}

export function asImportInput(payload: unknown): TurnImportInput {
  const request = parseConversationImportRequest(
    (payload as { request?: unknown })?.request,
  );
  if (!request)
    throw new Error("turns/importMessages requires an import request");
  return { ...asConversationInput(payload, "turns/importMessages"), request };
}

export function asAgentInput(payload: unknown, command: string): string {
  const agentId = (payload as { agentId?: unknown } | null)?.agentId;
  if (typeof agentId !== "string")
    throw new Error(`${command} requires a string agentId`);
  return agentId;
}
