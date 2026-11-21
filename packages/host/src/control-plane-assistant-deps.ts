import type { AssistantDeps } from "./routes/assistant";
import type { AssistantSandboxDeps } from "./routes/assistant-sandbox-deps";
import type { HeartbeatRouteDeps } from "./routes/heartbeat";

export interface ControlPlaneAssistantDeps {
  ensureSyntheticAgentDir?: AssistantDeps["ensureSyntheticAgentDir"];
  heartbeat?: HeartbeatRouteDeps["heartbeat"];
  assistantGateway?: AssistantSandboxDeps["assistantGateway"];
  unservedOperations?: AssistantSandboxDeps["unservedOperations"];
}
