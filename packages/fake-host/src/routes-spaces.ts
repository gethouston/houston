/**
 * C8 Spaces gateway routes for the fake host — the CROSS-org surface, a port of
 * `cloud/internal/edge/spaces_routes.go`. Unlike `/v1/org` (scoped to the ACTIVE
 * space via `x-houston-org`), these enumerate and mutate memberships regardless
 * of the active-space pin:
 *
 *   - `GET  /v1/orgs`                      → `{orgs, invites}`
 *   - `POST /v1/orgs {name}`               → `OrgSummary` (201, caller = owner)
 *   - `POST /v1/org-invites/:id/accept`    → `{org}` (201, the invitee joins)
 *   - `DELETE /v1/org-invites/:id`         → 204 (the invitee declines)
 *
 * The rejection BODIES are byte-shaped like the Go gateway's — a flat
 * `{error, code}` — because the client's taxonomy reads that `code`
 * (`app/src/lib/invite-model.ts` `classifyInviteError` via `shareErrorCode`).
 * Nest it and every expected state would fall through to the red bug toast.
 *
 * Which invite answers which rejection is armed per invite
 * (`FakeSpaceInvite.reject`, the `/__test__/space-invites` control), so the
 * error paths are reachable without racing a real state change.
 */

import { json, noContent } from "./http";
import * as state from "./state";
import type {
  FakeSpaceInvite,
  OrgRole,
  SpaceInviteRejection,
} from "./state-store";

const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "user"];
const REJECTIONS: readonly SpaceInviteRejection[] = [
  "needs_upgrade",
  "already_member",
  "invite_not_found",
];

/** A 16-lowercase-hex slug (the `org:<slug>` grammar `space-id.ts` enforces). */
function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[]) {
  return allowed.find((option) => option === value);
}

/**
 * The `POST /__test__/space-invites` control: normalize its payload into the
 * invitee-side inbox, replacing whatever was armed before. Only `orgName` is
 * required — the id, the slug the accepted team lands under, and the role all
 * default, so arming "one pending invite" is one field. A row with no usable
 * team name is DROPPED rather than served nameless: a card headlined "You were
 * invited to join " would be a fixture bug wearing a product bug's clothes.
 *
 * It lives beside the routes it arms (as `routes-teams.ts` keeps its own body
 * parsers) so the whole C8 Spaces fixture reads in one place.
 */
export function handleSpaceInvitesControl(
  body: Record<string, unknown> | undefined,
): Response {
  const rows = Array.isArray(body?.invites) ? body.invites : [];
  const invites = rows.flatMap<FakeSpaceInvite>((raw, index) => {
    const row = raw as Record<string, unknown>;
    const orgName = typeof row?.orgName === "string" ? row.orgName : "";
    if (!orgName) return [];
    const reject = pick(row.reject, REJECTIONS);
    return [
      {
        id: typeof row.id === "string" ? row.id : `space-invite-${index + 1}`,
        orgName,
        orgSlug: isSlug(row.orgSlug) ? row.orgSlug : state.mintTeamSlug(),
        role: pick(row.role, ORG_ROLES) ?? "user",
        ...(typeof row.invitedBy === "string"
          ? { invitedBy: row.invitedBy }
          : {}),
        ...(reject ? { reject } : {}),
      },
    ];
  });
  return json({ invites: state.setSpaceInvites(invites) });
}

/** `403 needs_upgrade` — the team's trial ended; the invite is KEPT. */
function needsUpgrade(): Response {
  return json({ error: "team needs upgrade", code: "needs_upgrade" }, 403);
}

/** `409 already_member` — the caller is in that team already; invite KEPT. */
function alreadyMember(): Response {
  return json(
    {
      error: "that user is already a member of this organization",
      code: "already_member",
    },
    409,
  );
}

/**
 * `404 invite_not_found` — revoked, already used, or addressed to another
 * email. The gateway deliberately cannot tell those apart (it looks the invite
 * up by the caller's verified email), so neither can this.
 */
function inviteNotFound(): Response {
  return json({ error: "invite not found", code: "invite_not_found" }, 404);
}

/**
 * Accept: the invite leaves the inbox and its team becomes a membership,
 * answered as `201 {org}`. A forced `invite_not_found` also drops the invite —
 * that models the revoked-between-fetch-and-click case, and the refetch is what
 * makes the stale card disappear.
 */
function acceptInvite(inviteId: string): Response {
  const invite = state.findSpaceInvite(inviteId);
  if (!invite) return inviteNotFound();
  if (invite.reject === "invite_not_found") {
    state.removeSpaceInvite(inviteId);
    return inviteNotFound();
  }
  if (invite.reject === "already_member") return alreadyMember();
  if (invite.reject === "needs_upgrade") return needsUpgrade();
  return json({ org: state.acceptSpaceInvite(invite) }, 201);
}

/**
 * Decline: the invite is dropped, `204`. Billing never gates a decline (no seat
 * is added), so `needs_upgrade` / `already_member` are not modelled here — only
 * the gone case, which 404s exactly as the gateway's missing-invite path does.
 */
function declineInvite(inviteId: string): Response {
  const invite = state.findSpaceInvite(inviteId);
  if (!invite) return inviteNotFound();
  state.removeSpaceInvite(inviteId);
  if (invite.reject === "invite_not_found") return inviteNotFound();
  return noContent();
}

/** Route a C8 Spaces request, or return `undefined` to fall through. */
export function handleSpacesRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  // GET /v1/orgs — every membership + every pending invite addressed to the
  // caller. Served unconditionally: the CLIENT gates on `capabilities.spaces`,
  // and a host that answers here while advertising no spaces is exactly the
  // shape the render gate has to survive.
  if (segs[0] === "v1" && segs[1] === "orgs" && segs.length === 2) {
    if (method === "GET") {
      return json({
        orgs: state.listSpaceOrgs(),
        invites: state.listSpaceInviteWires(),
      });
    }
    // POST /v1/orgs — mint a team with the caller as owner.
    if (method === "POST") {
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name) return json({ error: "name is required" }, 400);
      // The gateway's own ceiling (`maxTeamNameLen`), mirrored so the create
      // dialog's long-name rejection is reachable here too.
      if (name.length > 200) return json({ error: "name too long" }, 400);
      return json(state.createTeamSpace(name), 201);
    }
    return json({ error: "not found" }, 404);
  }

  // POST /v1/org-invites/:id/accept
  if (
    segs[0] === "v1" &&
    segs[1] === "org-invites" &&
    segs.length === 4 &&
    segs[3] === "accept"
  ) {
    if (method !== "POST") return json({ error: "not found" }, 404);
    return acceptInvite(decodeURIComponent(segs[2]));
  }

  // DELETE /v1/org-invites/:id
  if (segs[0] === "v1" && segs[1] === "org-invites" && segs.length === 3) {
    if (method !== "DELETE") return json({ error: "not found" }, 404);
    return declineInvite(decodeURIComponent(segs[2]));
  }

  return undefined;
}
