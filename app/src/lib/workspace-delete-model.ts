import type { BillingSummary, OrgMember } from "@houston/engine-adapter";
import { shareErrorCode } from "./share-error.ts";
import type { Workspace } from "./types.ts";

export type WorkspaceDeleteFailure =
  | "has_members"
  | "subscription_active"
  | "personal_space"
  | "unknown";

const EXPECTED_DELETE_CODES = new Set<WorkspaceDeleteFailure>([
  "has_members",
  "subscription_active",
  "personal_space",
]);

export function classifyWorkspaceDeleteError(
  err: unknown,
): WorkspaceDeleteFailure {
  const code = shareErrorCode(err);
  return code !== undefined &&
    EXPECTED_DELETE_CODES.has(code as WorkspaceDeleteFailure)
    ? (code as WorkspaceDeleteFailure)
    : "unknown";
}

export function isExpectedWorkspaceDeleteError(err: unknown): boolean {
  return classifyWorkspaceDeleteError(err) !== "unknown";
}

export function canDeleteOptimistically(
  members: readonly OrgMember[] | undefined,
  billing: BillingSummary | null,
): boolean {
  if (members === undefined || members.length > 1) return false;
  if (billing === null) return true;
  if (billing.plan !== "team") return false;
  return (
    billing.status !== "active" &&
    billing.status !== "past_due" &&
    billing.interval === undefined
  );
}

export function restoreSpaceRow(
  list: Workspace[],
  row: Workspace,
  index: number,
): Workspace[] {
  if (list.some((w) => w.id === row.id)) return list;
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), row, ...list.slice(at)];
}
