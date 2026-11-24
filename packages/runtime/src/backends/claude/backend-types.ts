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

export type ClaudeToken =
  | {
      kind: "oauth-token";
      value: string;
      accessDigest?: string;
      subscriptionType?: ClaudeSubscriptionType;
    }
  | { kind: "api-key"; value: string; accessDigest?: string };

export interface ClaudeBackendDeps {
  workspaceDir: string;
  layout: ClaudeLayout;
  readToken: () => ClaudeToken | undefined;
  toolSelection: ToolSelection;
  systemPrompt: string;
  fileGuard?: WorkspaceGuardOptions;
  integrations?: IntegrationToolOptions;
  assistant?: AssistantToolOptions;
  personalAssistant?: boolean;
  role?: AssistantRuntimeRole | null;
  tools?: BridgedPiTool[];
  browser?: BrowserToolOptions;
  sdk?: ClaudeSdk;
  sdkLoad?: Promise<ClaudeSdkLoadResult>;
  compactions?: CompactionCheckpoints;
  beforeTool?: ToolGate;
}
