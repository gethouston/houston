import type { ClaudeToken } from "./backend";
import { oneShotWithClaude } from "./one-shot";
import type { ClaudeQuery } from "./session";

/**
 * One-shot conversation title through the Claude Agent SDK. The COMPLIANCE reason
 * this exists: when the active provider is `anthropic`, the title must run through
 * the `claude` subprocess (token in `options.env`) exactly like a turn — never
 * pi's in-process Anthropic client, which is the harness-spoofing path Anthropic
 * server-blocks. So this is a real SDK query, not a completion helper.
 *
 * It is deliberately minimal vs a `ClaudeSession`: `allowedTools: []` (titles need
 * no tools), NO session persistence (no resume, no sessions.json write — a title
 * is a throwaway), and the SAME shared `CLAUDE_CONFIG_DIR` (`claudeLoginConfigDir`)
 * a turn uses, so it reads the identical cached credential. Text is collected via
 * the SAME stream translator turns use, so a
 * `provider_error` (rate limit, auth) simply yields no text → the caller falls
 * back to a truncated title rather than throwing.
 */
export interface ClaudeTitleParams {
  /** The excerpt to title. */
  excerpt: string;
  /** The product-neutral title system prompt (owned by the caller). */
  titlePrompt: string;
  workspaceDir: string;
  readToken: () => ClaudeToken | undefined;
  /** pi model id to title with; mapped to the SDK model string. */
  modelId?: string;
  /** Injected for tests; production lazily imports the optional SDK. */
  query?: ClaudeQuery;
}

export async function titleWithClaude(p: ClaudeTitleParams): Promise<string> {
  const text = await oneShotWithClaude({
    // The title instruction rides the PROMPT, not only `systemPrompt`: the
    // CLI the SDK spawns has been observed running the full claude_code
    // preset despite a custom string systemPrompt in the initialize request —
    // the model then ANSWERED the excerpt, and the first line of that answer
    // became the board title ("Yes, I have image capabilities. I…"). With the
    // instruction inline the reply is a title whichever prompt the CLI ends
    // up honoring.
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
    modelId: p.modelId,
    query: p.query,
  });
  return text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";
}
