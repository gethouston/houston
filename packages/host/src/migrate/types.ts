export interface ChatFeedRow {
  id: number;
  claude_session_id: string;
  feed_type: string;
  data_json: string;
  timestamp: string;
}

export interface SessionPair {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  tools?: { name: string; isError?: boolean }[];
}

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TranscriptMessage[];
}
