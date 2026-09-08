import type { SandboxFetch } from "./sandbox-fetch";

/**
 * WHICH agents the personal assistant may put work on, fetched live.
 *
 * The assistant keeps no board of its own, so a mission call that names no
 * agent is refused — and a refusal that does not say which agents exist sends
 * the model straight back to inventing a name (the same failure the provider
 * ladder was built to end, packages/domain/src/provider-choice.ts). This is the
 * list that refusal carries.
 *
 * It is read through the host's own assistant surface rather than a second
 * route: `/sandbox/assistant/call` performs catalogued operations, `listAgents`
 * IS the catalogued way to enumerate them, and that route is authorized for the
 * personal assistant alone — which is the only runtime that can reach this
 * refusal.
 */

/** One agent a mission can be put on. */
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
    // Houston's own dot-named agents hold no board and are never a target.
    if (typeof id !== "string" || typeof name !== "string") continue;
    if (!id || !name || name.startsWith(".")) continue;
    found.push({ id, name });
  }
  return found;
}

/**
 * The user's agents, or an empty list when they cannot be read (a host that
 * performs no operations, an offline moment). An empty list weakens the refusal
 * to "name one of the user's agents" instead of failing the call a second time
 * over the diagnostic for the first failure.
 */
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
    // Never a second failure on the diagnostic path: the caller's own refusal
    // is what the model has to act on, and it reads fine without the names. But
    // it must not be silent either - a refusal that stopped naming the agents
    // is how this reads to the user, and nothing else would say why.
    console.error(
      "[missions] could not read the user's agents for a refusal:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/** `Name (id …)` for every agent, or "" when none could be read. */
export function agentSummaryList(agents: readonly AgentSummary[]): string {
  return agents.map((a) => `${a.name} (id ${a.id})`).join(", ");
}
