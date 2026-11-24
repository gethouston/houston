import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { ClaudeSubscriptionType } from "../../auth/claude-plan";
import type { ToolSelection } from "../../session/tool-selection";
import type { AssistantToolOptions } from "../../session/tools/assistant";
import type { BrowserToolOptions } from "../../session/tools/browser/tool";
import type { WorkspaceGuardOptions } from "../../session/tools/fs-guard";
import type { IntegrationToolOptions } from "../../session/tools/integrations";
import type { CompactionCheckpoints } from "../../store/conversation-compaction";
import type { BridgedPiTool } from "./custom-tools";
import type { ClaudeLayout } from "./paths";
import type { ClaudeSdk, ClaudeSdkLoadResult } from "./sdk-loader";
import type { ToolGate } from "./tool-gate-hook";

/**
 * A resolved Anthropic credential for one SDK subprocess environment. An
 * OAuth token may carry the plan the gateway served with it
 * (`./served-plan`); a token read from anywhere else never does.
 */
export type ClaudeToken =
  | {
      kind: "oauth-token";
      value: string;
      accessDigest?: string;
      subscriptionType?: ClaudeSubscriptionType;
    }
  | { kind: "api-key"; value: string; accessDigest?: string };

/** Everything the Claude backend needs to open a session. */
export interface ClaudeBackendDeps {
  workspaceDir: string;
  layout: ClaudeLayout;
  readToken: () => ClaudeToken | undefined;
  toolSelection: ToolSelection;
  systemPrompt: string;
  /**
   * How much of the filesystem this runtime's ROLE may touch, as one policy
   * object (`session/coordinator-policy.ts` builds it) — extra writable roots
   * for an ordinary agent, an exact-file allowlist for the coordinator. Passed
   * whole rather than field by field: the Claude backend enforces file rules in
   * `canUseTool` instead of pi's clamped file tools, and a gate handed half a
   * policy is a wall with a hole in it.
   */
  fileGuard?: WorkspaceGuardOptions;
  integrations?: IntegrationToolOptions;
  /** The assistant family's catalog + host transport; absent → family off. */
  assistant?: AssistantToolOptions;
  /**
   * True when this runtime IS the user's personal assistant — the coordinator.
   * Clamps BOTH layers this backend controls: the SDK built-ins (tool-policy.ts)
   * and the bridged Houston tools (custom-tools.ts), so the Claude path exposes
   * the same coordinator surface the pi path does.
   */
  personalAssistant?: boolean;
  /** The coordinator role the system prompt is built for. Absent = the
   *  process's own; a pooled turn passes the turn's (`null` included). */
  role?: AssistantRuntimeRole | null;
  tools?: BridgedPiTool[];
  /** The long-lived runtime's `browser` tool options (a turn passes `tools`). */
  browser?: BrowserToolOptions;
  /** External SDK adapter for tests that must not spawn a process. */
  sdk?: ClaudeSdk;
  /** Optional import already running during pooled-turn hydration. */
  sdkLoad?: Promise<ClaudeSdkLoadResult>;
  /**
   * Where a compaction arms its summary. Absent = this process's own
   * conversations dir; a pooled turn names its hydrated tree's, or the
   * summary would land outside the conversation it summarizes.
   */
  compactions?: CompactionCheckpoints;
  beforeTool?: ToolGate;
}
