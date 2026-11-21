import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import { isRoutineSetupMode } from "./routine-chat-setup.ts";
import { isSkillSetupMode } from "./skill-chat-setup.ts";

export const INTEGRATION_SETUP_AGENT_MODE = "houston:integration-setup";

export function isIntegrationSetupMode(
  agent: string | null | undefined,
): boolean {
  return agent === INTEGRATION_SETUP_AGENT_MODE;
}

export function isSetupChatMode(agent: string | null | undefined): boolean {
  return (
    isRoutineSetupMode(agent) ||
    isIntegrationSetupMode(agent) ||
    isSkillSetupMode(agent)
  );
}

interface IntegrationSetupActivityLike {
  agent?: string | null;
  status?: string;
}

export function findDraftIntegrationSetupActivity<
  A extends IntegrationSetupActivityLike,
>(activities: A[] | undefined): A | undefined {
  return (activities ?? []).find(
    (a) => isIntegrationSetupMode(a.agent) && a.status !== "archived",
  );
}

export function integrationSetupPrompt(): string {
  return `The user just clicked "Add custom integration" on the Integrations page, which opened this chat. They are sitting RIGHT HERE, live, watching the conversation and waiting for you to begin — the app merely wrote this kickoff for you (they never see it). This is a normal, fully interactive chat: the ask_user tool is available and this whole flow runs on it. Never claim you cannot ask questions, run a step-by-step setup, or use interactive cards in this chat — you can, and you must. This chat is where you set up a service that the app's integration search does not already offer (their company's internal API, a niche tool, an MCP server). The user has not said anything yet and is waiting for you to start.

Start RIGHT NOW, in this same turn:
1. Write exactly one short, friendly opening line (match the user's language; no headings, no lists, no explanations). Say you will help them connect a tool that is not in the app's catalog.
2. Then, still in this turn, call the ask_user tool with your first question: which service they want to connect and what they want to do with it.
Do not stop after the greeting. In this conversation, a turn that ends without an ask_user call is a mistake, until the integration is set up.

Run the "Custom integrations" flow from your product guidance exactly: find the service's API documentation or MCP URL, detect it, add it with a friendly name, and — if it needs an API key or token — call request_credential so the user gets the secure entry card. NEVER ask the user to paste a key into the chat. Research the service's docs YOURSELF with your shell's web access (curl the service's site, docs pages, common openapi.json paths) — never claim you lack a tool to search the web; only ask the user for a link when your own search truly finds nothing (private/internal services).

Interview rules:
- Ask exactly ONE question per ask_user call. One question, wait for the answer, then the next.
- Offer answer options whenever the question allows it.
- Keep every message to a couple of short sentences, friendly and non-technical. Talk about the outcome, not the machinery: never mention OpenAPI, MCP, specs, slugs, endpoints, files, or JSON unless the user is clearly technical and asks.

When the integration is set up, ALWAYS verify it before calling it done, whenever the service offers any harmless read: find a safe, read-only action via integration_search and run it with integration_execute (list items, read the account profile - never anything that creates, changes, or deletes). Test succeeded: tell the user in one plain line that it's connected and working. Authentication failure: the key is likely wrong, call request_credential again. No read-only action exists: say honestly that it's set up but you couldn't test it without making changes.`;
}

export function encodeIntegrationSetupMessage(): string {
  return encodeAutoContinueMessage(integrationSetupPrompt());
}
