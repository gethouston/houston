import { json, noContent } from "./http";
import { createOrg } from "./routes-org-create";
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

function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[]) {
  return allowed.find((option) => option === value);
}

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

function needsUpgrade(): Response {
  return json({ error: "team needs upgrade", code: "needs_upgrade" }, 403);
}

function alreadyMember(): Response {
  return json(
    {
      error: "that user is already a member of this organization",
      code: "already_member",
    },
    409,
  );
}

function inviteNotFound(): Response {
  return json({ error: "invite not found", code: "invite_not_found" }, 404);
}

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

function declineInvite(inviteId: string): Response {
  const invite = state.findSpaceInvite(inviteId);
  if (!invite) return inviteNotFound();
  state.removeSpaceInvite(inviteId);
  if (invite.reject === "invite_not_found") return inviteNotFound();
  return noContent();
}

export function handleSpacesRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (segs[0] === "v1" && segs[1] === "orgs" && segs.length === 2) {
    if (method === "GET") {
      const freeOrg = state.spaceFreeOrg();
      return json({
        orgs: state.listSpaceOrgs(),
        invites: state.listSpaceInviteWires(),
        ...(freeOrg ? { freeOrg } : {}),
      });
    }
    if (method === "POST") return createOrg(body);
    return json({ error: "not found" }, 404);
  }

  if (
    segs[0] === "v1" &&
    segs[1] === "org-invites" &&
    segs.length === 4 &&
    segs[3] === "accept"
  ) {
    if (method !== "POST") return json({ error: "not found" }, 404);
    return acceptInvite(decodeURIComponent(segs[2]));
  }

  if (segs[0] === "v1" && segs[1] === "org-invites" && segs.length === 3) {
    if (method !== "DELETE") return json({ error: "not found" }, 404);
    return declineInvite(decodeURIComponent(segs[2]));
  }

  return undefined;
}
