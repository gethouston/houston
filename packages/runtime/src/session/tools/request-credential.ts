import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordCredentialRequest } from "../interaction";

/**
 * The secure key-entry hand-off tool (custom integrations, HOU-550). It
 * records a `credential` interaction step; Houston renders a secure entry
 * card in place of the chat input and posts the secret straight to the host —
 * the value never enters the transcript or this runtime.
 *
 * Available in EVERY acting mode, Autopilot included: an API key is the one
 * thing autonomy cannot produce, and the recorded step doesn't hold the turn
 * open — it ends the turn with the card, and the saved key auto-continues the
 * run (see AUTO_MODE_EXCLUDED_TOOL_NAMES in tool-selection.ts for the full
 * rationale).
 */
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

export function makeRequestCredentialTool() {
  return defineTool({
    name: REQUEST_CREDENTIAL_TOOL_NAME,
    label: "Ask the user for an API key securely",
    description:
      "Ask the user to enter a custom integration's API key or token. Houston shows a secure entry card in place of the chat input (the secret never enters the conversation), then automatically sends you a message once it is saved and verified so you can continue. NEVER ask the user to type a key or token into the chat.",
    promptSnippet: "Ask the user to enter an API key in a secure card",
    parameters: CredentialParams,
    executionMode: "sequential",
    async execute(_id: string, params: CredentialParams) {
      const toolkit = params.toolkit.trim().toLowerCase();
      if (!toolkit)
        throw new Error("request_credential needs a non-empty toolkit slug.");
      const reason = params.reason?.trim();
      recordCredentialRequest({ toolkit, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "A secure key-entry step was added to the interaction card Houston shows the user in place of the chat input. Queue anything else this task needs in this same turn, then end your turn. Do not ask the user to confirm - Houston sends you a message automatically once the key is saved.",
          },
        ],
        details: { toolkit },
      };
    },
  });
}
