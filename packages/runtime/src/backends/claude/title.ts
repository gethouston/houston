import type { ClaudeToken } from "./backend-types";
import { oneShotWithClaude } from "./one-shot";
import type { ClaudeQuery } from "./session";

export interface ClaudeTitleParams {
  excerpt: string;
  titlePrompt: string;
  workspaceDir: string;
  readToken: () => ClaudeToken | undefined;
  dataDir?: string;
  modelId?: string;
  query?: ClaudeQuery;
  signal?: AbortSignal;
}

export async function titleWithClaude(p: ClaudeTitleParams): Promise<string> {
  const text = await oneShotWithClaude({
    prompt: [
      p.titlePrompt,
      "",
      "Conversation excerpt:",
      p.excerpt,
      "",
      "Reply with ONLY the title.",
    ].join("\n"),
    systemPrompt: p.titlePrompt,
    workspaceDir: p.workspaceDir,
    readToken: p.readToken,
    dataDir: p.dataDir,
    modelId: p.modelId,
    query: p.query,
    ...(p.signal ? { signal: p.signal } : {}),
  });
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}
