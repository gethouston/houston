import type {
  AddOrgMemberResult,
  AuditEntry,
  ComputeUsage,
  OrgInfo,
  OrgRole,
  UsageRow,
  UserProfilesResult,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

export async function getOrg(cfg: ControlPlaneConfig): Promise<OrgInfo> {
  const res = await cpFetch(cfg, "/v1/org");
  return (await res.json()) as OrgInfo;
}

/**
 * Display profiles (name + photo) for the given member ids — any co-member of
 * the active space (the personal space resolves only the caller). Non-co-member
 * ids are omitted server-side. Degrades to an empty map on a gateway that
 * predates the route (404) — teammate faces then fall back to initials — so a
 * pre-feature host stays byte-identical. Mirrors `getAgentModelChoice`'s 404
 * swallow; every other error throws.
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

export async function deleteOrgInvite(
  cfg: ControlPlaneConfig,
  inviteId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}

export async function removeOrgMember(
  cfg: ControlPlaneConfig,
  userId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

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
