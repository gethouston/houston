import type {
  ChatMessage,
  TokenUsage,
  ToolCallRecord,
} from "@houston/runtime-client";

export interface UserMessageMeta {
  nonce?: string;
  author?: ChatMessage["author"];
  mentions?: ChatMessage["mentions"];
  turnId?: string;
  displayText?: string;
}

export interface AssistantMessageMeta {
  tools?: ToolCallRecord[];
  thinking?: string;
  usage?: TokenUsage | null;
  providerSwitch?: ChatMessage["providerSwitch"];
  compaction?: ChatMessage["compaction"];
  contextCleared?: true;
  providerError?: ChatMessage["providerError"];
  fileChanges?: ChatMessage["fileChanges"];
  pendingInteraction?: ChatMessage["pendingInteraction"];
  stopped?: true;
  interrupted?: ChatMessage["interrupted"];
  turnId?: string;
}
