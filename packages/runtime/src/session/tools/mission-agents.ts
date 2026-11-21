import type { SandboxFetch } from "./sandbox-fetch";

export interface AgentSummary {
  id: string;
  name: string;
}

const CALL_PATH = "/sandbox/assistant/call";

function summarize(payload: unknown): AgentSummary[] {
  if (!Array.isArray(payload)) return [];
  const found: AgentSummary[] = [];
  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name } = entry as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || typeof name !== "string") continue;
    if (!id || !name || name.startsWith(".")) continue;
    found.push({ id, name });
  }
  return found;
}

export async function reachableAgentSummaries(
  call: SandboxFetch,
  signal?: AbortSignal,
): Promise<AgentSummary[]> {
  try {
    const res = await call(CALL_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "listAgents", params: {} }),
      signal,
    });
    if (!res.ok) {
      console.error(
        `[missions] could not read the user's agents for a refusal: HTTP ${res.status}`,
      );
      return [];
    }
    return summarize(await res.json());
  } catch (err) {
    console.error(
      "[missions] could not read the user's agents for a refusal:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

export function agentSummaryList(agents: readonly AgentSummary[]): string {
  return agents.map((a) => `${a.name} (id ${a.id})`).join(", ");
}
