/**
 * Shared shapes for the Rust-era chat-history migration. The source `chat_feed`
 * row and the target v3 transcript, kept here so linkage.ts / reconstruct.ts /
 * chat-history.ts agree on one definition.
 */

/** A row of the Rust `chat_feed` table. `data_json` is a JSON string whose
 * shape depends on `feed_type` (see reconstruct.ts). */
export interface ChatFeedRow {
  id: number;
  claude_session_id: string;
  feed_type: string;
  data_json: string;
  timestamp: string;
}

/** A user/assistant TEXT pair destined for the synthesized pi session (the
 * agent-memory side). Tool/thinking/file items never become a pair. */
export interface SessionPair {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

/** The v3 transcript message — mirrors runtime's ChatMessage
 * (packages/protocol/src/conversation.ts). Re-declared here rather than imported
 * because the transcript file is written directly, not via @houston/runtime. */
export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  /** epoch ms */
  ts: number;
  tools?: { name: string; isError?: boolean }[];
}

/** The v3 transcript file shape — mirrors runtime's StoredConversation
 * (packages/runtime/src/store/conversation-file.ts). */
export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TranscriptMessage[];
}
