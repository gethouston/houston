/**
 * The per-agent activities REST calls, over the injected `fetch`.
 *
 * The runtime client (`@houston/runtime-client`) is scoped to one conversation
 * and serves no typed `.houston` surface, so this module talks to the HOST's
 * `/agents/:id/activities` routes directly through `ports.fetch` — the SAME
 * routes `engine-adapter/control-plane.ts` uses. Auth rides the injected
 * `fetch` (the host wires a bearer-attaching `fetch`), exactly as the agents
 * module does.
 *
 * Errors never get swallowed: a non-2xx throws an {@link ActivitiesHttpError}
 * carrying the HTTP `status`, which `CommandRegistry.dispatch` surfaces as an
 * `ok: false` result. A `401` additionally fires {@link onUnauthorized} so a
 * lapsed session token becomes a visible `tokenExpired` signal.
 */

import type { Activity, ActivityUpdate, NewActivity } from "@houston/protocol";
import type { SdkPorts } from "../../ports";
import type { ActivitiesWrites } from "./types";

/** A failed `/activities` request. `status` is the upstream HTTP status. */
export class ActivitiesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ActivitiesHttpError";
  }
}

/** The activities operations the module (and mission search) need. */
export interface ActivitiesHttp {
  list(agentId: string): Promise<Activity[]>;
  create(agentId: string, input: NewActivity): Promise<Activity>;
  update(
    agentId: string,
    id: string,
    update: ActivityUpdate,
  ): Promise<Activity>;
  remove(agentId: string, id: string): Promise<void>;
}

export function createActivitiesHttp(
  baseUrl: string,
  ports: SdkPorts,
  onUnauthorized: () => void,
): ActivitiesHttp {
  const root = baseUrl.replace(/\/+$/, "");
  const base = (agentId: string): string =>
    `${root}/agents/${encodeURIComponent(agentId)}/activities`;

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await ports.fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      if (res.status === 401) onUnauthorized();
      const body = await res.text().catch(() => "");
      throw new ActivitiesHttpError(
        body || `activities request failed: ${res.status}`,
        res.status,
      );
    }
    return res;
  }

  return {
    async list(agentId) {
      const res = await req(base(agentId));
      return ((await res.json()) as { items: Activity[] }).items;
    },
    async create(agentId, input) {
      const res = await req(base(agentId), {
        method: "POST",
        body: JSON.stringify(input),
      });
      return (await res.json()) as Activity;
    },
    async update(agentId, id, update) {
      const res = await req(`${base(agentId)}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      });
      return (await res.json()) as Activity;
    },
    async remove(agentId, id) {
      await req(`${base(agentId)}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };
}

/**
 * The no-refetch {@link ActivitiesWrites}: the underlying http ops surfaced
 * directly (returning the wire entity), with no post-write refresh. `setStatus`
 * and `rename` are the `update` PATCH with a `{ status }` / `{ title }` body —
 * the same wire writes the refetching facade issues, minus the refetch.
 */
export function createActivitiesWrites(http: ActivitiesHttp): ActivitiesWrites {
  return {
    create: (agentId, input) => http.create(agentId, input),
    setStatus: (agentId, id, status) => http.update(agentId, id, { status }),
    rename: (agentId, id, title) => http.update(agentId, id, { title }),
    delete: (agentId, id) => http.remove(agentId, id),
  };
}
