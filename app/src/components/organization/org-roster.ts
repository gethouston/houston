import type { OrgMember } from "@houston/engine-adapter";
import { personDisplayName } from "./people-tab-model.ts";

export interface RosterAgent {
  id: string;
  name: string;
  folderPath: string;
}

export interface UnnamedLabels {
  unnamedAccount: string;
  formerMember: string;
}

export function memberLabel(
  userId: string,
  members: readonly OrgMember[] | undefined,
  labels: UnnamedLabels,
): string {
  const found = members?.find((m) => m.userId === userId);
  return found
    ? personDisplayName(found, labels.unnamedAccount)
    : labels.formerMember;
}

export function agentLabel(
  slug: string | undefined,
  agents: readonly RosterAgent[] | undefined,
): string {
  if (!slug) return "";
  const found = agents?.find((a) => a.folderPath === slug || a.id === slug);
  if (found) return found.name;
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
