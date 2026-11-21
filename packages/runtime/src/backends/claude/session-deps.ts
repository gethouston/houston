import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { ThinkingLevel } from "../types";
import type { SessionsStore } from "./sessions-store";

export type ClaudeQuery = (params: {
  prompt: string;
  options: Options;
}) => AsyncIterable<SDKMessage>;

export interface TurnAuth {
  env: NonNullable<Options["env"]>;
  accessDigest?: string;
}

export interface ClaudeSessionDeps {
  query: ClaudeQuery;
  conversationId: string;
  baseOptions: Options;
  sessionsStore: SessionsStore;
  compactions?: CompactionCheckpoints;
  model: string;
  thinkingLevel?: ThinkingLevel;
  freshRetryPromptPrefix?: () => string;
  refreshAuth: (promptTokens?: number) => TurnAuth;
  recordedContextTokens?: () => number | undefined;
  usedAccessDigest?: string;
}
