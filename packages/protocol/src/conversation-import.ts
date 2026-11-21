import { z } from "zod";
import type { ChatMessage } from "./conversation";

export const ConversationImportRequestSchema = z.strictObject({
  importId: z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,127}$/),
  at: z.enum(["start", "end"]).optional(),
  messages: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(500),
});
export type ConversationImportRequest = z.infer<
  typeof ConversationImportRequestSchema
>;
export type ConversationImportMessage =
  ConversationImportRequest["messages"][number];

export interface ConversationImportResult {
  ok: true;
  imported: number;
}

export const CONVERSATION_IMPORT_INVALID = "invalid_import";

export function parseConversationImportRequest(
  body: unknown,
): ConversationImportRequest | null {
  const parsed = ConversationImportRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function importedTurnId(importId: string, index: number): string {
  return `import:${importId}:${index}`;
}

export function holdsImport(
  messages: readonly ChatMessage[],
  importId: string,
): boolean {
  const prefix = `import:${importId}:`;
  return messages.some((message) => message.turnId?.startsWith(prefix));
}

export function importedMessages(
  request: ConversationImportRequest,
  ts: number,
): ChatMessage[] {
  return request.messages.map((message, index) => ({
    role: message.role,
    content: message.content,
    ts,
    turnId: importedTurnId(request.importId, index),
  }));
}
