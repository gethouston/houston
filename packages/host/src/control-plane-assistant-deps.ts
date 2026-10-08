import type { AssistantDeps } from "./routes/assistant";
import type { AssistantSandboxDeps } from "./routes/assistant-sandbox-deps";

/** Deployment-specific operations available to the AI Manager. */
export interface ControlPlaneAssistantDeps {
  /** Materialize the personal assistant's home on local filesystem profiles. */
  ensureSyntheticAgentDir?: AssistantDeps["ensureSyntheticAgentDir"];
  /** Resolve user-facing operations through the gateway or this host. */
  assistantGateway?: AssistantSandboxDeps["assistantGateway"];
  /** Operations this deployment cannot perform. */
  unservedOperations?: AssistantSandboxDeps["unservedOperations"];
}
