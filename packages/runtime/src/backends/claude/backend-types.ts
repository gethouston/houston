import type { ToolSelection } from "../../session/tool-selection";
import type { IntegrationToolOptions } from "../../session/tools/integrations";
import type { BridgedPiTool } from "./custom-tools";
import type { ClaudeLayout } from "./paths";
import type { ClaudeSdk, ClaudeSdkLoadResult } from "./sdk-loader";

/** A resolved Anthropic credential for one SDK subprocess environment. */
export type ClaudeToken =
  | { kind: "oauth-token"; value: string; accessDigest?: string }
  | { kind: "api-key"; value: string; accessDigest?: string };

/** Everything the Claude backend needs to open a session. */
export interface ClaudeBackendDeps {
  workspaceDir: string;
  layout: ClaudeLayout;
  readToken: () => ClaudeToken | undefined;
  toolSelection: ToolSelection;
  systemPrompt: string;
  sharedRoots?: string[];
  integrations?: IntegrationToolOptions;
  tools?: BridgedPiTool[];
  /** External SDK adapter for tests that must not spawn a process. */
  sdk?: ClaudeSdk;
  /** Optional import already running during pooled-turn hydration. */
  sdkLoad?: Promise<ClaudeSdkLoadResult>;
}
