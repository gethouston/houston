import type { ChatMessage } from "@houston/protocol";

export type TranscriptTurnWrite =
  | {
      kind: "user";
      turnId: string;
      message: ChatMessage;
      title: string;
      expectedCount: number;
    }
  | {
      kind: "assistant";
      turnId: string;
      message: ChatMessage;
    };

/** Build the strict user/assistant PUT shared by every transcript sender. */
export function transcriptTurnRequest(
  conversationUrl: string,
  write: TranscriptTurnWrite,
) {
  const url = `${conversationUrl}/turns/${encodeURIComponent(write.turnId)}/${write.kind}`;
  if (write.kind === "user") {
    return {
      method: "PUT" as const,
      url,
      body: {
        message: write.message,
        ts: write.message.ts,
        title: write.title,
        expectedCount: write.expectedCount,
        // The strict route derives replay state itself and rejects extra keys.
      },
    };
  }
  return {
    method: "PUT" as const,
    url,
    body: { message: write.message, ts: write.message.ts },
  };
}
