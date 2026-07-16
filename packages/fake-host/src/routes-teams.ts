/**
 * Teams v2 gateway routes for the fake host: the per-agent settings the client
 * reads with `getAgentSettings` (`GET /v1/agents/:slug/settings`) and the org
 * ceiling `getOrgSettings` reads (`GET /v1/org/settings`), plus their manager /
 * owner `PUT` replacers.
 *
 * These mirror the closed cloud gateway (C7 Teams v2, `agent_settings` /
 * `org_settings`) — the surface the host repo itself never serves, since the
 * ceiling lives only above the engine. They read/write the single-user Teams
 * settings in state; the wire shapes match `@houston-ai/engine-client`'s
 * `AgentSettings` / `OrgSettings` exactly so the mock can't drift.
 */

import { json } from "./http";
import * as state from "./state";

/** Read a `string[] | null` field from a JSON body, preserving an explicit null. */
function toolkitList(value: unknown): string[] | null {
  if (value === null) return null;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return null;
}

/** Route a Teams settings request, or return `undefined` to fall through. */
export function handleTeamsRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  // /v1/org — the caller's org identity + role (+ a minimal roster). The
  // Organization ("Admin") view loads this on mount; `role` drives owner-edit
  // vs admin-read-only on the policy tabs, so it MIRRORS the advertised
  // capabilities role (a spec arming `role:"admin"` gets a read-only editor).
  // Defaults to owner when a spec armed no role. On a Teams host the real
  // gateway backs this; single-player never reaches it (the view is gated to
  // multiplayer owner/admin).
  if (segs[0] === "v1" && segs[1] === "org" && segs.length === 2) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    const role = state.getCapabilities().role ?? "owner";
    return json({
      id: "org-e2e",
      slug: "acme",
      name: "Acme",
      role,
      members: [{ userId: "u-self", email: "you@acme.test", role }],
      invites: [],
    });
  }

  // /v1/agents/:slug/settings — the agent ceiling + org ceiling + access.
  if (
    segs[0] === "v1" &&
    segs[1] === "agents" &&
    segs.length === 4 &&
    segs[3] === "settings"
  ) {
    const s = state.getTeamsSettings();
    if (method === "GET") {
      return json({
        allowedToolkits: s.allowedToolkits,
        orgAllowedToolkits: s.orgAllowedToolkits,
        access: s.access,
        allowedModels: s.allowedModels,
        orgAllowedModels: s.orgAllowedModels,
      });
    }
    if (method === "PUT") {
      // Both fields optional — update one ceiling without touching the other.
      if (body && "allowedToolkits" in body) {
        state.setTeamsSettings({
          allowedToolkits: toolkitList(body.allowedToolkits),
        });
      }
      if (body && "allowedModels" in body) {
        state.setTeamsSettings({
          allowedModels: toolkitList(body.allowedModels),
        });
      }
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  // /v1/org/compute-usage — per-agent running time (awake/active ms per UTC
  // day). Served only when a spec armed a dataset via `/__test__/compute-usage`;
  // unarmed it 404s like a desktop host or a pre-feature gateway. `asOf` is
  // minted at read time — the wire promises a server clock, not a fixed seed.
  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "compute-usage" &&
    segs.length === 3
  ) {
    const seed = state.getComputeUsage();
    if (method !== "GET" || !seed) return json({ error: "not found" }, 404);
    return json({
      asOf: new Date().toISOString(),
      awakeNow: seed.awakeNow,
      rows: seed.rows,
    });
  }

  // /v1/org/settings — the org-wide app + AI-model ceilings.
  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "settings" &&
    segs.length === 3
  ) {
    const s = state.getTeamsSettings();
    if (method === "GET") {
      return json({
        allowedToolkits: s.orgAllowedToolkits,
        allowedModels: s.orgAllowedModels,
      });
    }
    if (method === "PUT") {
      // Partial patch — change one org ceiling without touching the other.
      if (body && "allowedToolkits" in body) {
        state.setTeamsSettings({
          orgAllowedToolkits: toolkitList(body.allowedToolkits),
        });
      }
      if (body && "allowedModels" in body) {
        state.setTeamsSettings({
          orgAllowedModels: toolkitList(body.allowedModels),
        });
      }
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  return undefined;
}
