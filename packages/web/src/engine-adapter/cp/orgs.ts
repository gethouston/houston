import type {
  AddOrgMemberResult,
  AuditEntry,
  ComputeUsage,
  OrgInfo,
  OrgRole,
  OrgSettings,
  UsageRow,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

export async function getOrg(cfg: ControlPlaneConfig): Promise<OrgInfo> {
  const res = await cpFetch(cfg, "/v1/org");
  return (await res.json()) as OrgInfo;
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

export async function getOrgSettings(
  cfg: ControlPlaneConfig,
): Promise<OrgSettings> {
  const res = await cpFetch(cfg, "/v1/org/settings");
  return (await res.json()) as OrgSettings;
}

export async function setOrgSettings(
  cfg: ControlPlaneConfig,
  settings: {
    allowedToolkits?: string[] | null;
    allowedModels?: string[] | null;
  },
): Promise<void> {
  await cpFetch(cfg, "/v1/org/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
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
