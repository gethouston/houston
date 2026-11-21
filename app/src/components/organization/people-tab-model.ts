import type {
  AddOrgMemberResult,
  OrgMember,
  OrgRole,
} from "@houston/engine-adapter";
import type { SeatAddedNote } from "@houston/sdk";

export function personDisplayName(
  member: Pick<OrgMember, "displayName" | "email" | "userId">,
  fallback: string,
): string {
  const named = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed === "" ? undefined : trimmed;
  };
  return named(member.displayName) ?? named(member.email) ?? fallback;
}

export function rosterPersonName(
  member: Pick<OrgMember, "displayName" | "email" | "userId">,
  unnamedAccount: string,
): string {
  return personDisplayName(member, unnamedAccount);
}

export function initialsFor(source: string): string {
  const at = source.indexOf("@");
  const base = at > 0 ? source.slice(0, at) : source;
  const parts = base.split(/[.\-_+\s]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
      : base.slice(0, 2);
  return letters.toUpperCase() || "?";
}

export function canEditMember(opts: {
  canManage: boolean;
  isSelf: boolean;
  role: OrgRole;
}): boolean {
  return opts.canManage && !opts.isSelf;
}

export function grantsOwner(next: OrgRole, current?: OrgRole): boolean {
  return next === "owner" && current !== "owner";
}

export interface AddOutcome {
  kind: "added" | "invited";
  email: string;
  seat: SeatAddedNote | null;
}

export function describeAddResult(
  email: string,
  result: AddOrgMemberResult,
  seat: SeatAddedNote | null = null,
): AddOutcome {
  const kind = result.invited ? "invited" : "added";
  return { kind, email: result.email ?? email, seat };
}
