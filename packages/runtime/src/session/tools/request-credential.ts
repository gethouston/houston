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

/** What the pre-flight lookup needs back from the host: the definition's
 *  compile state (the rest of the view is irrelevant here). `null` = no
 *  definition with that slug exists. */
export interface CredentialTargetStatus {
  state:
    | { status: "active"; toolCount: number }
    | { status: "pending" }
    | { status: "error"; message: string };
}

export interface RequestCredentialToolOptions {
  /** Resolve the slug against the host's registered custom integrations
   *  (the sandbox `status` route). */
  status: (
    slug: string,
    signal: AbortSignal | undefined,
  ) => Promise<CredentialTargetStatus | null>;
}

export function makeRequestCredentialTool(opts: RequestCredentialToolOptions) {
  return defineTool({
    name: REQUEST_CREDENTIAL_TOOL_NAME,
    label: "Ask the user for an API key securely",
    description:
      "Ask the user to authenticate a custom integration. For a key-based integration Houston shows a secure entry card in place of the chat input (the secret never enters the conversation); for a sign-in (oauth) integration the same card shows a Sign in button that opens the service's own sign-in in their browser. Either way Houston automatically sends you a message once it is done so you can continue. NEVER ask the user to type a key or token into the chat.",
    promptSnippet: "Ask the user to enter a key or sign in via a secure card",
    parameters: CredentialParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: CredentialParams,
      signal: AbortSignal | undefined,
    ) {
      const toolkit = params.toolkit.trim().toLowerCase();
      if (!toolkit)
        throw new Error("request_credential needs a non-empty toolkit slug.");
      // Pre-flight (PRODUCT-1292): a card for a slug the host has no
      // definition for renders fine but every save 404s — a user-facing dead
      // end. Refuse HERE, where the model can still correct course.
      const target = await opts.status(toolkit, signal);
      if (!target) {
        throw new Error(
          `No custom integration '${toolkit}' is set up, so Houston cannot show a secure entry card for it. Use the EXACT slug a custom_integration_add result returned. If this service was never added: when it exists in integration_search, connect it through the normal app connect flow instead; for a custom API or MCP server, run custom_integration_detect and custom_integration_add first, then call request_credential again.`,
        );
      }
      if (target.state.status === "error") {
        throw new Error(
          `The custom integration '${toolkit}' is not working (${target.state.message}), so a saved key could not be used. Repair it first with custom_integration_add (replace: true) and a corrected spec, then call request_credential again.`,
        );
      }
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
