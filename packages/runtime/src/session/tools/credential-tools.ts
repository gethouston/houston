import type { AssistantToolOptions } from "./assistant-call";
import { makeCoordinatorCredentialTool } from "./coordinator-credential";
import { makeCustomIntegrationTools } from "./custom-integrations";
import type { IntegrationToolOptions } from "./integrations";

/**
 * WHICH secure key-entry surface a runtime gets, decided in ONE place.
 *
 * The two backends build their tool sets independently (`session/host-tools.ts`
 * for pi, `backends/claude/mcp-tool-set.ts` for the Claude bridge), and this
 * choice is the kind that must never differ between them: an assistant that can
 * ask for a key on one provider and not on another is the same agent behaving
 * differently for reasons the user cannot see.
 */

/** Everything the choice reads. Both backends express their state as this. */
export interface CredentialToolsInput {
  /** True when this runtime IS the user's personal assistant (coordinator). */
  personalAssistant: boolean;
  /** The assistant family's catalog + host transport, when the family is on. */
  assistant?: AssistantToolOptions;
  /** The host transport the custom-integration tools proxy through. */
  integrations?: IntegrationToolOptions;
}

/**
 * The coordinator asks for keys through its own catalogued read (the same host
 * scope its other operations use), so it gets THAT tool and none of the
 * custom-integration setup tools — it does not author integrations, it operates
 * Houston. Every other runtime gets the setup family, which carries its own
 * `request_credential`. Either way a runtime with no host in front of it gets
 * nothing: there is no one to register a definition with.
 */
export function credentialTools(input: CredentialToolsInput) {
  if (input.personalAssistant) {
    if (!input.assistant) return [];
    return [makeCoordinatorCredentialTool(input.assistant)];
  }
  if (!input.integrations) return [];
  return makeCustomIntegrationTools(input.integrations);
}
