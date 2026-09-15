import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChatMessage } from "@houston/protocol";
import type { CredentialVault } from "../ports";
import type {
  TranscriptShadow,
  TranscriptShadowCommand,
} from "../transcripts/http-shadow";
import { bearer, json, readJson } from "./http";
import { defineRouteFamily } from "./registry";

const ROOT = /^\/sandbox\/transcripts\/conversations\/([^/]+)(?:\/(.*))?$/;

/** The conversation this family addresses; every command hangs off it. */
const CONVERSATION = "/sandbox/transcripts/conversations/:conversationId";

/**
 * The six shadow commands, plus the prefix they are the whole of: anything
 * else under a conversation is a MALFORMED command (400), not somebody else's
 * route, and saying so is what tells a runtime its shadow write was wrong
 * rather than unauthenticated.
 */
defineRouteFamily({
  group: "sandbox-transcripts",
  members: [
    { method: "PUT", path: CONVERSATION },
    { method: "DELETE", path: CONVERSATION },
    { method: "PUT", path: `${CONVERSATION}/turns/:turnId/user` },
    { method: "PUT", path: `${CONVERSATION}/turns/:turnId/assistant` },
    { method: "POST", path: `${CONVERSATION}/truncate` },
    { method: "POST", path: `${CONVERSATION}/repair` },
  ],
  owns: [CONVERSATION, `${CONVERSATION}/`, `${CONVERSATION}/*rest`],
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The runtime mirrors its transcript through here with a per-sandbox HMAC token; no client writes the shadow.",
  source: "packages/host/src/routes/transcripts-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxTranscripts(deps, method, path, url, req, res),
});

export async function handleSandboxTranscripts(
  deps: {
    vault: CredentialVault;
    transcriptShadow?: TranscriptShadow;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(ROOT);
  if (!match) return false;
  const token = bearer(req, url);
  if (!token || !deps.vault.validateSandboxToken(token)) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.transcriptShadow) {
    json(res, 503, { error: "transcript shadow not configured" });
    return true;
  }

  let conversationId: string;
  try {
    conversationId = decodeURIComponent(match[1] ?? "");
  } catch {
    json(res, 400, { error: "invalid conversation id" });
    return true;
  }
  const rest = match[2] ?? "";
  const body = method === "DELETE" ? {} : await readJson(req);
  const command = parseCommand(method, rest, conversationId, body);
  if (!command) {
    json(res, 400, { error: "invalid transcript shadow request" });
    return true;
  }
  await deps.transcriptShadow.apply(command);
  json(res, 202, { ok: true });
  return true;
}

function parseCommand(
  method: string,
  rest: string,
  conversationId: string,
  body: Record<string, unknown>,
): TranscriptShadowCommand | null {
  const turn = rest.match(/^turns\/([^/]+)\/(user|assistant)$/);
  if (method === "PUT" && turn) {
    const message = body.message;
    if (!isChatMessage(message)) return null;
    const turnId = decodeURIComponent(turn[1] ?? "");
    if (turn[2] === "assistant") {
      if (message.role !== "assistant" || mismatchedTurn(message, turnId)) {
        return null;
      }
      return { kind: "assistant", conversationId, turnId, message };
    }
    if (
      message.role !== "user" ||
      mismatchedTurn(message, turnId) ||
      !Number.isSafeInteger(body.expectedCount) ||
      (body.expectedCount as number) < 0 ||
      typeof body.title !== "string"
    ) {
      return null;
    }
    return {
      kind: "user",
      conversationId,
      turnId,
      message,
      title: body.title,
      expectedCount: body.expectedCount as number,
    };
  }
  if (method === "POST" && rest === "truncate") {
    return typeof body.turnId === "string"
      ? { kind: "truncate", conversationId, turnId: body.turnId }
      : null;
  }
  if (method === "POST" && rest === "repair") {
    return body && typeof body === "object"
      ? { kind: "repair", conversationId, conversation: body }
      : null;
  }
  if (method === "PUT" && rest === "") {
    return typeof body.title === "string"
      ? {
          kind: "rename",
          conversationId,
          title: body.title,
        }
      : null;
  }
  if (method === "DELETE" && rest === "") {
    return { kind: "delete", conversationId };
  }
  return null;
}

function mismatchedTurn(message: ChatMessage, turnId: string): boolean {
  return message.turnId !== undefined && message.turnId !== turnId;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.ts === "number"
  );
}
