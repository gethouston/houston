import type { KanbanPerson } from "@houston-ai/board";
import type { UserProfile } from "../hooks/queries/use-user-profiles";

/**
 * Pure, DOM-free translation between Houston's per-mission attribution wire
 * shape (`created_by` + `contributors`, server-stamped only in hosted Teams)
 * and the generic {@link KanbanPerson} face-stack model the board renders.
 * Mirrors `org-roles.ts`: no React, no store, no Supabase — so the ordering /
 * dedup / label-fallback rules are unit-tested in isolation and reused by both
 * the card face stacks and the filter-by-person control.
 */

/** The attribution fields a conversation carries (subset of RawConversation). */
export interface MissionAttribution {
  created_by?: string;
  contributors?: { user_id: string; name?: string }[];
}

/**
 * Build the ordered face stack for one mission: the creator first (deduped
 * against the contributor list), then the remaining contributors in stored
 * order. Label falls back profile name > stored contributor name > a short id
 * slice; the avatar image is the profile avatar when known.
 */
export function buildMissionPeople(
  conv: MissionAttribution,
  profiles: ReadonlyMap<string, UserProfile>,
): KanbanPerson[] {
  const contributorName = new Map<string, string | undefined>();
  for (const c of conv.contributors ?? []) {
    // First stored entry for an id wins (keep the earliest collaboration).
    if (!contributorName.has(c.user_id)) contributorName.set(c.user_id, c.name);
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  };
  push(conv.created_by);
  for (const c of conv.contributors ?? []) push(c.user_id);

  return orderedIds.map((id) => {
    const profile = profiles.get(id);
    const label = profile?.name ?? contributorName.get(id) ?? id.slice(0, 8);
    const imageUrl = profile?.avatarUrl ?? undefined;
    return imageUrl ? { id, label, imageUrl } : { id, label };
  });
}

/**
 * Distinct contributor ids (creator + collaborators) across a set of
 * conversations — the argument for the batched `useUserProfiles` lookup.
 */
export function collectContributorIds(convs: MissionAttribution[]): string[] {
  const ids = new Set<string>();
  for (const conv of convs) {
    if (conv.created_by) ids.add(conv.created_by);
    for (const c of conv.contributors ?? []) ids.add(c.user_id);
  }
  return Array.from(ids);
}

/** True when the given person is on this mission's face stack. */
export function missionMatchesPerson(
  people: KanbanPerson[] | undefined,
  userId: string,
): boolean {
  return (people ?? []).some((p) => p.id === userId);
}

/**
 * Distinct people (by id, first occurrence wins) across the visible board
 * items — the roster the filter-by-person menu offers.
 */
export function distinctBoardPeople(
  items: { people?: KanbanPerson[] }[],
): KanbanPerson[] {
  const byId = new Map<string, KanbanPerson>();
  for (const item of items) {
    for (const person of item.people ?? []) {
      if (!byId.has(person.id)) byId.set(person.id, person);
    }
  }
  return Array.from(byId.values());
}
