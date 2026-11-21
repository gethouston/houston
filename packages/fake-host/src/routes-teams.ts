import { json } from "./http";
import * as state from "./state";
import type { FakeAssignment, FakeMember } from "./state-store";
import { FAKE_ORG_NAME, SELF_USER_ID } from "./state-store";

function toolkitList(value: unknown): string[] | null {
  if (value === null) return null;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return null;
}

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

export function handleTeamsRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
  url: URL,
): Response | undefined {
  if (segs[0] === "v1" && segs[1] === "org" && segs.length === 2) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    const role = state.getCapabilities().role ?? "owner";
    if (role === "user") {
      return json({ id: "org-e2e", slug: "acme", name: FAKE_ORG_NAME, role });
    }
    const members = state.getOrgMembers() ?? [
      { userId: SELF_USER_ID, email: "you@acme.test", role },
    ];
    return json({
      id: "org-e2e",
      slug: "acme",
      name: FAKE_ORG_NAME,
      role,
      members,
      invites: state.getOrgInvites(),
    });
  }

  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "profiles" &&
    segs.length === 3
  ) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    const raw = url.searchParams.get("ids") ?? "";
    const wanted = new Set(raw.split(",").filter(Boolean));
    const members = state.getOrgMembers() ?? [];
    const profiles: Record<
      string,
      { displayName?: string; photoUrl?: string }
    > = {};
    for (const m of members) {
      if (!wanted.has(m.userId)) continue;
      if (m.displayName === undefined && m.photoUrl === undefined) continue;
      profiles[m.userId] = {
        ...(m.displayName !== undefined ? { displayName: m.displayName } : {}),
        ...(m.photoUrl !== undefined ? { photoUrl: m.photoUrl } : {}),
      };
    }
    return json({ profiles });
  }

  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "people" &&
    segs.length === 3
  ) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    const members = state.getOrgMembers() ?? [];
    const byName = (a: FakeMember, b: FakeMember) =>
      (a.displayName ?? "")
        .toLowerCase()
        .localeCompare((b.displayName ?? "").toLowerCase()) ||
      a.userId.localeCompare(b.userId);
    const named = members
      .filter((m) => m.displayName !== undefined)
      .sort(byName);
    const unnamed = members
      .filter((m) => m.displayName === undefined)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    return json({
      people: [...named, ...unnamed].map((m) => ({
        userId: m.userId,
        ...(m.displayName !== undefined ? { displayName: m.displayName } : {}),
        ...(m.photoUrl !== undefined ? { photoUrl: m.photoUrl } : {}),
      })),
    });
  }

  if (
    segs[0] === "v1" &&
    segs[1] === "org" &&
    segs[2] === "members" &&
    segs.length === 3 &&
    method === "POST"
  ) {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) return json({ error: "missing email" }, 400);
    const role = body?.role === "admin" ? "admin" : "user";
    const invite = state.addOrgInvite(email, role);
    return json({ invited: true, email: invite.email, role: invite.role }, 202);
  }

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
