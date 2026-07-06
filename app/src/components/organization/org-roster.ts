import type { OrgMember } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free display helpers for the Organization dashboard (Teams v2).
 * Audit and usage rows carry raw user ids and agent slugs; these resolve them
 * to human names (email / agent name) against the loaded roster + agent list,
 * with a graceful fallback so a missing entry never renders a bare uuid or
 * crashes the feed. Node:test-safe (no React, no DOM).
 */

/** A minimal agent shape the resolvers need — the loaded agent list rows. */
export interface RosterAgent {
  id: string;
  name: string;
  /** The engine route key, which is the agent slug audit/usage rows carry. */
  folderPath: string;
}

/** Shorten an opaque id for a last-resort label (never the primary path). */
export function shortenId(id: string): string {
  if (!id) return "";
  return id.length <= 12 ? id : id.slice(0, 8);
}

/**
 * A member's display name: their email when the host exposed it, else a
 * shortened id. Never throws — a stranger id (a since-removed member still
 * named in an old audit row) degrades to the short id.
 */
export function memberLabel(
  userId: string,
  members: readonly OrgMember[] | undefined,
): string {
  const found = members?.find((m) => m.userId === userId);
  return found?.email ?? shortenId(userId);
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
