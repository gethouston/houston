/**
 * The custom-integration setup chat — the guided conversation that lives
 * INSIDE the Integrations page (mirrors the routine setup chat, HOU-725). The
 * "Add custom integration" button starts it: an agent runs the interview
 * (which service, its API/MCP URL, and any key via `request_credential`) right
 * next to the Custom integrations list, never as a board mission.
 *
 * Like the routine kickoff, the first message rides the auto-continue marker
 * (`lib/auto-continue-message.ts`): the user never typed it, so the transcript
 * hides the bubble on both the optimistic and reload paths and the chat opens
 * with the AGENT's greeting. The product prompt's "Custom integrations" section
 * (packages/host/src/houston-prompt.ts) does the heavy lifting; this kickoff
 * just tells the agent to start the interview now.
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";
import { isRoutineSetupMode } from "./routine-chat-setup.ts";
import { isSkillSetupMode } from "./skill-chat-setup.ts";

/**
 * Sentinel stored in the activity's `agent` (mode) field so every mission
 * surface can recognize a custom-integration setup chat and keep it off the
 * boards. Namespaced with `houston:` so it can never collide with a
 * user-defined agent-mode id — the routine sentinel uses the same convention.
 */
export const INTEGRATION_SETUP_AGENT_MODE = "houston:integration-setup";

/** True when an activity's `agent` (mode) marks it as an integration-setup chat. */
export function isIntegrationSetupMode(
  agent: string | null | undefined,
): boolean {
  return agent === INTEGRATION_SETUP_AGENT_MODE;
}

/**
 * True for ANY guided-setup sentinel (routine, integration, or skill). This
 * is the one predicate every board / badge / notification filter uses so the
 * hidden-chat kinds are handled by the same mechanism, never forked.
 */
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

/**
 * The agent's one live integration-setup draft: an integration-setup chat that
 * has not been archived. Unlike routines there is no back-link to reconcile —
 * a custom integration created during the chat lives in its own list, so the
 * draft simply persists until the user discards it (archives it) or starts a
 * fresh one. Works over both the per-agent activity list and the cross-agent
 * conversation list (both carry `agent` + `status`).
 */
export function findDraftIntegrationSetupActivity<
  A extends IntegrationSetupActivityLike,
>(activities: A[] | undefined): A | undefined {
  return (activities ?? []).find(
    (a) => isIntegrationSetupMode(a.agent) && a.status !== "archived",
  );
}

/**
 * The Claude-facing kickoff. English on purpose (all prompts are); the agent
 * mirrors the user's language when it answers. It leans entirely on the
 * product prompt's "Custom integrations" guidance for the actual steps —
 * `custom_integration_detect` / `custom_integration_add` / `request_credential`
 * — and only forces the agent to open the interview in this same turn.
 */
export function integrationSetupPrompt(): string {
  return `Houston sent this message automatically: the user clicked "Add custom integration" on the Integrations page. This chat is where you set up a service that the app's integration search does not already offer (their company's internal API, a niche tool, an MCP server). The user has not said anything yet and is waiting for you to start.

Start RIGHT NOW, in this same turn:
1. Write exactly one short, friendly opening line (match the user's language; no headings, no lists, no explanations). Say you will help them connect a tool that is not in the app's catalog.
2. Then, still in this turn, call the ask_user tool with your first question: which service they want to connect and what they want to do with it.
Do not stop after the greeting. In this conversation, a turn that ends without an ask_user call is a mistake, until the integration is set up.

Run the "Custom integrations" flow from your product guidance exactly: find the service's API documentation or MCP URL, detect it, add it with a friendly name, and — if it needs an API key or token — call request_credential so Houston shows the secure entry card. NEVER ask the user to paste a key into the chat. Research the service's docs YOURSELF with your shell's web access (curl the service's site, docs pages, common openapi.json paths) — never claim you lack a tool to search the web; only ask the user for a link when your own search truly finds nothing (private/internal services).

Interview rules:
- Ask exactly ONE question per ask_user call. One question, wait for the answer, then the next.
- Offer answer options whenever the question allows it.
- Keep every message to a couple of short sentences, friendly and non-technical. Talk about the outcome, not the machinery: never mention OpenAPI, MCP, specs, slugs, endpoints, files, or JSON unless the user is clearly technical and asks.

When the integration is set up, ALWAYS verify it before calling it done, whenever the service offers any harmless read: find a safe, read-only action via integration_search and run it with integration_execute (list items, read the account profile - never anything that creates, changes, or deletes). Test succeeded: tell the user in one plain line that it's connected and working. Authentication failure: the key is likely wrong, call request_credential again. No read-only action exists: say honestly that it's set up but you couldn't test it without making changes.`;
}

/**
 * The full first-message body for a new integration-setup chat: marker (hides
 * the bubble) + the kickoff (what the model acts on).
 */
export function encodeIntegrationSetupMessage(): string {
  return encodeAutoContinueMessage(integrationSetupPrompt());
}
