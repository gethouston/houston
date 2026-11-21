import type { Capabilities, OrgsList } from "@houston/engine-adapter";
import type { FirstResponseOutcome } from "@houston/sdk";
import { activeSpaceOrgSlug } from "@houston/sdk";
import { hasSpaces } from "./org-roles.ts";
import type { PerfSpanName, PerfSpanTags } from "./perf-spans.ts";
import { orgSlugFromWorkspaceId } from "./space-id.ts";

export function perfSpanOrgSlug(
  capabilities: Capabilities | null,
  workspaceId: string | undefined,
  orgs: OrgsList | undefined,
): string | null {
  if (!hasSpaces(capabilities)) return null;
  const team = workspaceId ? orgSlugFromWorkspaceId(workspaceId) : null;
  return activeSpaceOrgSlug(team, orgs);
}

export function perfSpanNeedsMemberships(
  capabilities: Capabilities | null,
  workspaceId: string | undefined,
): boolean {
  return (
    hasSpaces(capabilities) &&
    workspaceId !== undefined &&
    orgSlugFromWorkspaceId(workspaceId) === null
  );
}

export interface PerfSpanEventProps {
  span: PerfSpanName;
  duration_ms: number;
  org_slug?: string;
  outcome?: FirstResponseOutcome;
}

export function perfSpanEventProps(
  span: PerfSpanName,
  ms: number,
  tags: PerfSpanTags,
): PerfSpanEventProps {
  return {
    span,
    duration_ms: ms,
    ...(tags.orgSlug ? { org_slug: tags.orgSlug } : {}),
    ...(tags.outcome ? { outcome: tags.outcome } : {}),
  };
}
