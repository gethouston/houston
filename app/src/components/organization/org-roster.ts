import type { OrgMember } from "@houston/engine-adapter";
import { personDisplayName } from "./people-tab-model.ts";

/**
 * Pure, DOM-free display helpers for the Organization dashboard (Teams v2).
 * Audit and usage rows carry raw user ids and agent slugs; these resolve them
 * to human names (email / agent name) against the loaded roster + agent list,
 * with translated stand-ins so a missing entry never renders an id or crashes
 * the feed. Node:test-safe (no React, no DOM).
 */

/** A minimal agent shape the resolvers need — the loaded agent list rows. */
export interface RosterAgent {
  id: string;
  name: string;
  /** The engine route key, which is the agent slug audit/usage rows carry. */
  folderPath: string;
}

/** Translated stand-ins for a person the screen cannot name. */
export interface UnnamedLabels {
  /** A member on the roster with no name and no email. */
  unnamedAccount: string;
  /** An id no longer on the roster (a since-removed member in an old row). */
  formerMember: string;
}

/**
 * A member's display name, resolved from the raw id an audit row, usage row
 * or invite carries. The name itself is the shared {@link personDisplayName};
 * an opaque id is never shown, not even shortened.
 */
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

/**
 * An agent's display name from its slug. Audit rows carry `agentSlug`, which is
 * the engine route key (`Agent.folderPath`); match on that first, then id, then
 * humanize the raw slug so a since-deleted agent still reads sensibly.
 */
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
