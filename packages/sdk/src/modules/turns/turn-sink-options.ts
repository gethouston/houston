import type { ChatMessage } from "@houston/runtime-client";
import type { TurnCardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import type { FirstResponseClock } from "./first-response";

export interface TurnSinkOptions {
  agentPath: string;
  sessionKey: string;
  output: FeedOutput;
  mode: "turn" | "observer";
  nonce?: string;
  provider?: string;
  prompt?: string;
  stop: () => void;
  reloadHistory: () => Promise<ChatMessage[]>;
  presettledPollMs?: number;
  historyGuard: (messages: ChatMessage[]) => boolean;
  firstResponse?: FirstResponseClock;
  board?: TurnCardWrites;
}
