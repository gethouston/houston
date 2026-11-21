export const HOUSTON_API_DOCS = {
  overview: "https://gethouston.ai/developers",
  missions: "https://gethouston.ai/developers/missions",
  mcp: "https://gethouston.ai/developers/mcp",
  a2a: "https://gethouston.ai/developers/a2a",
} as const;

export const HOUSTON_API_KEY_ENV = "HOUSTON_API_KEY";

export interface ApiSetupPromptInput {
  baseUrl: string;
  agentId: string;
  agentName: string;
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
