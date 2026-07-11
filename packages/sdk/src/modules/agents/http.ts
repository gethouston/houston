/**
 * The agent-list REST calls, over the injected `fetch`.
 *
 * The runtime client (`@houston/runtime-client`) is scoped to ONE conversation
 * and exposes no agent-list surface, so this module talks to the host's
 * `/agents` routes directly through `ports.fetch` — the same routes
 * `control-plane.ts` uses. Auth rides the injected `fetch` (the host wires a
 * `fetch` that attaches the bearer), exactly as the kernel constructs the
 * runtime client without a token.
 *
 * Errors never get swallowed: a non-2xx throws an {@link AgentsHttpError}
 * carrying the HTTP `status`, which `CommandRegistry.dispatch` surfaces as an
 * `ok: false` result. A `401` additionally fires {@link onUnauthorized} so a
 * lapsed session token becomes a visible `tokenExpired` signal.
 */

import type { SdkPorts } from "../../ports";
import type { AgentCreateInput, WireAgent } from "./types";

/** A failed `/agents` request. `status` is the upstream HTTP status. */
export class AgentsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentsHttpError";
  }
}

/** The four agent-list operations the module needs. */
export interface AgentsHttp {
  list(): Promise<WireAgent[]>;
  create(input: AgentCreateInput): Promise<WireAgent>;
  rename(id: string, name: string): Promise<WireAgent>;
  remove(id: string): Promise<void>;
}

export function createAgentsHttp(
  baseUrl: string,
  ports: SdkPorts,
  onUnauthorized: () => void,
): AgentsHttp {
  const root = baseUrl.replace(/\/+$/, "");

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await ports.fetch(`${root}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      if (res.status === 401) onUnauthorized();
      const body = await res.text().catch(() => "");
      throw new AgentsHttpError(
        body || `agents request failed: ${res.status}`,
        res.status,
      );
    }
    return res;
  }

  return {
    async list() {
      return (await (await req("/agents")).json()) as WireAgent[];
    },
    async create(input) {
      // `JSON.stringify` drops undefined optionals, so a `{ name }` input posts
      // exactly `{ "name": … }` — byte-identical to the legacy body iOS sends.
      const res = await req("/agents", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return (await res.json()) as WireAgent;
    },
    async rename(id, name) {
      const res = await req(`/agents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      return (await res.json()) as WireAgent;
    },
    async remove(id) {
      await req(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}
