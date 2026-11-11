/**
 * The prompt a person pastes into their AI agent or AI assistant to wire one
 * AI Employee into their own code through the Houston API. One builder for
 * every surface: the employee's API access screen copies it, and the AI
 * Manager points people at that screen instead of writing its own.
 *
 * It NEVER carries a key. A copied prompt lands in chat histories and repos, so
 * it names the `HOUSTON_API_KEY` environment variable instead and tells the
 * agent to ask for the key, never to print, hardcode or commit it.
 * Copying the prompt mints nothing.
 */

/** The public developer docs (`website/src/developers/*`), one page per face. */
export const HOUSTON_API_DOCS = {
  overview: "https://gethouston.ai/developers",
  missions: "https://gethouston.ai/developers/missions",
  mcp: "https://gethouston.ai/developers/mcp",
  a2a: "https://gethouston.ai/developers/a2a",
} as const;

/** The environment variable the prompt tells the agent to read. */
export const HOUSTON_API_KEY_ENV = "HOUSTON_API_KEY";

export interface ApiSetupPromptInput {
  /** The gateway origin the person's code calls, e.g. `https://gateway.gethouston.ai`. */
  baseUrl: string;
  /** The employee's public slug (its client-side id on the hosted gateway). */
  agentId: string;
  agentName: string;
  /** The organization the employee lives in, sent as `x-houston-org`. */
  orgId: string;
}

export function apiSetupPrompt(input: ApiSetupPromptInput): string {
  const base = input.baseUrl.replace(/\/+$/, "");
  const agent = encodeURIComponent(input.agentId);
  const missions = `${base}/v1/agents/${agent}/missions`;
  const env = HOUSTON_API_KEY_ENV;
  return `Help me connect my code to "${input.agentName}", an AI Employee in Houston, through the Houston API.

Connection details:
- Base URL: ${base}
- Agent ID: ${input.agentId}
- Organization ID: ${input.orgId}

Every request sends these two headers:
- Authorization: Bearer <the API key>
- x-houston-org: ${input.orgId}

The API key: read it from the ${env} environment variable. If it is not set, stop and ask me for it. I create keys in the Houston app under Settings > API keys. Never print the key, hardcode it, log it, or commit it.

How the API works:
1. Start a task (a "mission"): POST ${missions} with JSON {"input": "what to do"}. The response is the mission; keep its "id".
2. Follow it live: GET ${missions}/<id>/events (Server-Sent Events).
3. Read the result: GET ${missions}/<id>. "status" ends as completed, failed or canceled, and "result" holds the answer.
4. Continue the same task: POST ${missions}/<id>/messages with JSON {"input": "what to do next"}. Keep using the same mission id and event stream.
5. If the mission has "pendingInteraction", the agent is waiting on a question. Show me the question and its options, then send my answer with step 4.
Optional: add "webhook": {"url": "https://...", "secret": "..."} when starting a mission to get a POST when it finishes.

Read the reference before using anything not listed here: ${HOUSTON_API_DOCS.overview} (REST: ${HOUSTON_API_DOCS.missions}, MCP: ${HOUSTON_API_DOCS.mcp}, A2A: ${HOUSTON_API_DOCS.a2a}).`;
}
