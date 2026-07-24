/**
 * Teams v2 gateway routes for the fake host: the per-agent settings the client
 * reads with `getAgentSettings` (`GET /v1/agents/:slug/settings`) plus its
 * manager `PUT` replacer.
 *
 * These mirror the closed cloud gateway (C7 Teams v2, `agent_settings`) — the
 * surface the host repo itself never serves, since the ceiling lives only above
 * the engine. They read/write the single-user Teams settings in state; the wire
 * shape matches `@houston-ai/engine-client`'s `AgentSettings` exactly so the mock
 * can't drift.
 */

import { json } from "./http";
import * as state from "./state";
import type { FakeAssignment } from "./state-store";

/** Read a `string[] | null` field from a JSON body, preserving an explicit null. */
function toolkitList(value: unknown): string[] | null {
  if (value === null) return null;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return null;
}

/**
 * The `PUT /agents/:slug/assignments` body → a normalized assignee roster. The
 * v2 `{assignments:[{userId,access}]}` wins; the legacy `{userIds:[...]}` maps
 * each to `access:"user"`. An absent/blank body clears the roster.
 */
function assignmentsFromBody(
  body: Record<string, unknown> | undefined,
): FakeAssignment[] {
  const v2 = body?.assignments;
  if (Array.isArray(v2)) {
    return v2.flatMap((a) => {
      const row = a as { userId?: unknown; access?: unknown };
      if (typeof row.userId !== "string") return [];
      const access = row.access === "manager" ? "manager" : "user";
      return [{ userId: row.userId, access }];
    });
  }
  const userIds = body?.userIds;
  if (Array.isArray(userIds)) {
    return userIds
      .filter((u): u is string => typeof u === "string")
      .map((userId) => ({ userId, access: "user" as const }));
  }
  return [];
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
    // The real gateway serves the roster (and invites) ONLY to owner/admin; a
    // plain member (`user`) gets just the identity + role. Mirror that so the
    // read-only Permissions People tab exercises its honest empty-roster degrade.
    if (role === "user") {
      return json({ id: "org-e2e", slug: "acme", name: "Acme", role });
    }
    // An armed roster (the per-member access lens) is served verbatim; unarmed
    // it stays the single-self roster synthesized from the advertised role.
    const members = state.getOrgMembers() ?? [
      { userId: "u-self", email: "you@acme.test", role },
    ];
    return json({
      id: "org-e2e",
      slug: "acme",
      name: "Acme",
      role,
      members,
      invites: state.getOrgInvites(),
    });
  }

  // POST /v1/org/members — add a member by email (Teams v2). The fake host
  // models the invite path only: every email is treated as not-yet-a-user, so
  // it mints a pending invite and answers `202 { invited:true }` (the wire
  // `AddOrgMemberResult` shape). The new invite then surfaces in `GET /v1/org`'s
  // `invites`, so the People tab's pending-invite row renders after the refetch.
  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "members" &&
    segs.length === 3 &&
    method === "POST"
  ) {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) return json({ error: "missing email" }, 400);
    // Org roles are owner/admin/user; a grant is admin or user (never owner).
    const role = body?.role === "admin" ? "admin" : "user";
    const invite = state.addOrgInvite(email, role);
    return json({ invited: true, email: invite.email, role: invite.role }, 202);
  }

  // DELETE /v1/org/invites/:id — revoke a pending invite (owner/admin).
  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "invites" &&
    segs.length === 4 &&
    method === "DELETE"
  ) {
    state.setOrgInvites(state.getOrgInvites().filter((i) => i.id !== segs[3]));
    return json({ ok: true });
  }

  // /v1/agents/:slug/assignments — set-replace the agent's assignee roster
  // (Teams v2, owner or manager-admin). Accepts the v2 `{assignments}` body and
  // the legacy `{userIds}` (mapped to `access:"user"`); mirrors the real gateway.
  if (
    segs[0] === "v1" &&
    segs[1] === "agents" &&
    segs.length === 4 &&
    segs[3] === "assignments"
  ) {
    if (method !== "PUT") return json({ error: "not found" }, 404);
    const assignments = assignmentsFromBody(body);
    const updated = state.setAgentAssignments(segs[2], assignments);
    if (!updated) return json({ error: "agent not found" }, 404);
    return json({ ok: true });
  }

  // /v1/agents/:slug/settings — the agent ceiling (whole allowlist) + access.
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
        access: s.access,
        allowedModels: s.allowedModels,
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

  return undefined;
}
