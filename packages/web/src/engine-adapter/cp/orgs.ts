import type {
  AddOrgMemberResult,
  AuditEntry,
  ComputeUsage,
  OrgInfo,
  OrgPerson,
  OrgRole,
  UsageRow,
  UserProfilesResult,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Shows the current space, the user's role in it, and the people in it.
 * @assistant group:org
 */
export async function getOrg(cfg: ControlPlaneConfig): Promise<OrgInfo> {
  const res = await cpFetch(cfg, "/v1/org");
  return (await res.json()) as OrgInfo;
}

/**
 * Looks up the names and photos of people in this space.
 *
 * Display profiles (name + photo) for the given member ids — any co-member of
 * the active space (the personal space resolves only the caller). Non-co-member
 * ids are omitted server-side. Degrades to an empty map on a gateway that
 * predates the route (404) — teammate faces then fall back to initials — so a
 * pre-feature host stays byte-identical. Mirrors `getAgentModelChoice`'s 404
 * swallow; every other error throws.
 * @assistant group:org hidden: UI plumbing; resolves member ids to the names and photos the app's avatars render.
 */
export async function getOrgProfiles(
  cfg: ControlPlaneConfig,
  ids: string[],
): Promise<UserProfilesResult> {
  if (ids.length === 0) return { profiles: {} };
  const query = new URLSearchParams({ ids: ids.join(",") }).toString();
  try {
    const res = await cpFetch(cfg, `/v1/org/profiles?${query}`);
    return (await res.json()) as UserProfilesResult;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) {
      return { profiles: {} };
    }
    throw err;
  }
}

/**
 * Lists the people the user shares this space with.
 *
 * The sanitized co-member directory of the active space (the personal space
 * resolves only the caller), named-first: no emails, no roles. It backs the
 * composer's @mention autocomplete and the renderer's chips. Degrades to an
 * empty list on a gateway that predates the route (404) — `@` then just types
 * plainly and no popover ever opens — so a pre-feature host stays
 * byte-identical. Mirrors `getOrgProfiles`'s 404 swallow; every other error
 * throws.
 * @assistant group:org
 */
export async function getOrgPeople(
  cfg: ControlPlaneConfig,
): Promise<OrgPerson[]> {
  try {
    const res = await cpFetch(cfg, "/v1/org/people");
    return ((await res.json()) as { people?: OrgPerson[] }).people ?? [];
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return [];
    throw err;
  }
}

/**
 * Invites someone to this space with the role the user chooses.
 * @assistant group:org confirm
 */
export async function addOrgMember(
  cfg: ControlPlaneConfig,
  email: string,
  role: OrgRole,
): Promise<AddOrgMemberResult> {
  const res = await cpFetch(cfg, "/v1/org/members", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return (await res.json()) as AddOrgMemberResult;
}

/**
 * Cancels a pending invitation to this space.
 * @assistant group:org confirm
 */
export async function deleteOrgInvite(
  cfg: ControlPlaneConfig,
  inviteId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}

/**
 * Removes someone from the current space.
 * @assistant group:org confirm
 */
export async function removeOrgMember(
  cfg: ControlPlaneConfig,
  userId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/**
 * Changes what someone is allowed to do in this space.
 * @assistant group:org confirm
 */
export async function setOrgMemberRole(
  cfg: ControlPlaneConfig,
  userId: string,
  role: OrgRole,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

/**
 * Shows the record of who did what in this space, newest first.
 * @assistant group:org
 * @assistant unroutable: debt: the query string is assembled into the path from an optional options object; routable once before and limit are plain parameters.
 * @assistant unschematized: an audit entry's subject varies per event type and carries the changed record verbatim.
 */
export async function orgAudit(
  cfg: ControlPlaneConfig,
  opts: { before?: number; limit?: number } = {},
): Promise<AuditEntry[]> {
  const q = new URLSearchParams();
  if (opts.before !== undefined) q.set("before", opts.before.toString());
  if (opts.limit !== undefined) q.set("limit", opts.limit.toString());
  const suffix = q.toString();
  const res = await cpFetch(cfg, `/v1/org/audit${suffix ? `?${suffix}` : ""}`);
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}

/**
 * Shows how much each person and agent used this space over recent days.
 * @assistant group:org
 */
export async function orgUsage(
  cfg: ControlPlaneConfig,
  days: number,
): Promise<UsageRow[]> {
  const res = await cpFetch(
    cfg,
    `/v1/org/usage?days=${encodeURIComponent(days.toString())}`,
  );
  return ((await res.json()) as { rows: UsageRow[] }).rows;
}

/**
 * Shows how much running time each agent used over recent days.
 * @assistant group:org
 */
export async function computeUsage(
  cfg: ControlPlaneConfig,
  days: number,
): Promise<ComputeUsage> {
  const res = await cpFetch(
    cfg,
    `/v1/org/compute-usage?days=${encodeURIComponent(days.toString())}`,
  );
  return (await res.json()) as ComputeUsage;
}
