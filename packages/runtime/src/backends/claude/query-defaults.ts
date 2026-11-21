import type { Options } from "@anthropic-ai/claude-agent-sdk";

export const CLAUDE_QUERY_DEFAULTS: Pick<
  Options,
  "settingSources" | "includePartialMessages" | "permissionMode" | "title"
> = {
  settingSources: [],
  includePartialMessages: true,
  permissionMode: "default",
  title: "Houston",
};
