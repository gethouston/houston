import {
  defineTool,
  type ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordCredentialRequest } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";
import { VERIFY_STEP } from "./custom-integration-steps";

export const REQUEST_CREDENTIAL_TOOL_NAME = "request_credential";

const CredentialParams = Type.Object({
  toolkit: Type.String({
    description:
      "The custom integration's slug, from the custom_integration_add result.",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "A short, plain-language line telling the user which key to paste and where to find it.",
    }),
  ),
});
type CredentialParams = Static<typeof CredentialParams>;

export interface CredentialTargetStatus {
  state:
    | { status: "active"; toolCount: number }
    | { status: "pending" }
    | { status: "error"; message: string };
}

export interface RequestCredentialToolOptions {
  status: (
    slug: string,
    signal: AbortSignal | undefined,
    context: ExtensionToolContext,
  ) => Promise<CredentialTargetStatus | null>;
}

export function makeRequestCredentialTool(opts: RequestCredentialToolOptions) {
  return defineTool({
    name: REQUEST_CREDENTIAL_TOOL_NAME,
    label: "Ask the user for an API key securely",
    description:
      "Ask the user to authenticate a custom integration. For a key-based integration the app shows a secure entry card in place of the chat input (the secret never enters the conversation); for a sign-in (oauth) integration the same card shows a Sign in button that opens the service's own sign-in in their browser. Either way you automatically get a message once it is done so you can continue. NEVER ask the user to type a key or token into the chat.",
    promptSnippet: "Ask the user to enter a key or sign in via a secure card",
    parameters: CredentialParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: CredentialParams,
      signal: AbortSignal | undefined,
      _update: unknown,
      context: ExtensionToolContext,
    ) {
      assertNotPlanMode("request an integration connection");
      const toolkit = params.toolkit.trim().toLowerCase();
      if (!toolkit)
        throw new Error("request_credential needs a non-empty toolkit slug.");
      const target = await opts.status(toolkit, signal, context);
      if (!target) {
        throw new Error(
          `No custom integration '${toolkit}' is set up, so no secure entry card can be shown for it. Use the EXACT slug a custom_integration_add result returned. If this service was never added: when it exists in integration_search, connect it through the normal app connect flow instead; for a custom API or MCP server, run custom_integration_detect and custom_integration_add first, then call request_credential again.`,
        );
      }
      if (target.state.status === "error") {
        throw new Error(
          `The custom integration '${toolkit}' is not working (${target.state.message}), so a saved key could not be used. Repair it first with custom_integration_add (replace: true) and a corrected spec, then call request_credential again.`,
        );
      }
      assertNotPlanMode("request an integration connection");
      const reason = params.reason?.trim();
      recordCredentialRequest({ toolkit, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: `A secure key-entry step was added to the interaction card the user sees in place of the chat input. Queue anything else this task needs in this same turn, then end your turn. Do not ask the user to confirm - you get a message automatically once the key is saved. Then: ${VERIFY_STEP}`,
          },
        ],
        details: { toolkit },
      };
    },
  });
}
