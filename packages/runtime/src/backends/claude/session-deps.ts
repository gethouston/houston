import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { ThinkingLevel } from "../types";
import type { SessionsStore } from "./sessions-store";

/**
 * The SDK `query` function, narrowed to what a session consumes: one call runs
 * one turn to completion, yielding SDK messages. Injected (not imported) so the
 * contract suite drives a scripted async generator with no binary or network.
 */
export type ClaudeQuery = (params: {
  prompt: string;
  options: Options;
}) => AsyncIterable<SDKMessage>;

/**
 * One turn's credential material: the full subprocess env carrying the CURRENT
 * stored token, and that token's access digest (undefined for an api_key or a
 * config-dir credential). Re-read per prompt — see `ClaudeSessionDeps.refreshAuth`.
 */
export interface TurnAuth {
  env: NonNullable<Options["env"]>;
  accessDigest?: string;
}

/** Everything a `ClaudeSession` needs; assembled by the backend factory. */
export interface ClaudeSessionDeps {
  query: ClaudeQuery;
  conversationId: string;
  /** Static per-session options (cwd, tools, canUseTool, systemPrompt, …). */
  baseOptions: Options;
  sessionsStore: SessionsStore;
  compactions?: CompactionCheckpoints;
  /** Initial SDK model string. */
  model: string;
  thinkingLevel?: ThinkingLevel;
  /** Canonical history used only when a rejected resume must retry fresh. */
  freshRetryPromptPrefix?: string;
  /**
   * Re-read the stored credential and rebuild the subprocess env from it.
   * Called at the start of EVERY prompt (PRODUCT-1355): each `query()` spawns
   * its own SDK subprocess (resumed by session id), so the env is a per-turn
   * lever — a session must never stay pinned to the token it was built with,
   * because the gateway's normal rotation invalidates the superseded access
   * token and every later turn on the baked-in env would 401 `token_revoked`
   * forever. May throw the scope guard's typed refusal (a personal scope whose
   * token disappeared); exec-turn classifies that into the reconnect card, the
   * same surface `createSession`'s own guard produces.
   */
  refreshAuth: () => TurnAuth;
  /**
   * Digest of the OAuth access token in the subprocess env at BUILD time —
   * what a revoked-token report names. Updated by `refreshAuth` on every
   * prompt, so it always tracks the token the CURRENT turn runs on
   * (PRODUCT-1319, PRODUCT-1355). Undefined when the session runs on an
   * api_key or the config-dir credential, where the report must not fire.
   */
  usedAccessDigest?: string;
}
