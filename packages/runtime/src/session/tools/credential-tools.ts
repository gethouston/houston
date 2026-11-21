import type { AssistantToolOptions } from "./assistant-call";
import { makeCoordinatorCredentialTool } from "./coordinator-credential";
import { makeCustomIntegrationTools } from "./custom-integrations";
import type { IntegrationToolOptions } from "./integrations";

export interface CredentialToolsInput {
  personalAssistant: boolean;
  assistant?: AssistantToolOptions;
  integrations?: IntegrationToolOptions;
}

export function credentialTools(input: CredentialToolsInput) {
  if (input.personalAssistant) {
    if (!input.assistant) return [];
    return [makeCoordinatorCredentialTool(input.assistant)];
  }
  if (!input.integrations) return [];
  return makeCustomIntegrationTools(input.integrations);
}
