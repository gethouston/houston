import type { KanbanItem, KanbanPerson } from "@houston-ai/board";
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
 * The single face that represents a mission's WORKING PERSON on the per-agent
 * board (its card icon), picked from the built face stack:
 *
 * - the most-recently-active contributor, i.e. the LAST person on the stack.
 *   `contributors` is stored in APPEND order (see {@link buildMissionPeople}),
 *   so the last entry is the latest teammate to join. This is an acceptable v1
 *   recency signal — Activity carries no per-turn "last touched" timestamp yet,
 *   so append order is the only recency information available;
 * - falls back to the creator when the mission has no separate contributors
 *   (the stack is then just `[creator]`, whose last element IS the creator);
 * - returns `undefined` when there is no attribution at all (single-player /
 *   legacy), so the caller shows the agent icon instead.
 *
 * Mission Control (cross-agent) deliberately does NOT use this — it keeps the
 * agent helmet so the board stays legible across many agents. Only the
 * per-agent surface swaps the icon for a person face.
 */
export function iconPersonFor(
  people: KanbanPerson[] | undefined,
): KanbanPerson | undefined {
  if (!people || people.length === 0) return undefined;
  return people[people.length - 1];
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
 * Build the per-mission face stacks for a single agent's board, keyed by the
 * mission id (the conversation / activity id — the board item's `id`). The
 * cross-agent board maps attribution inline while it builds its cards; the
 * per-agent board maps its cards from the activity list (which carries no
 * attribution) and joins these stacks on afterward, so this keeps that join
 * pure and unit-testable. Missions with no contributors get no entry.
 */
export function buildBoardPeopleById(
  convs: (MissionAttribution & { id: string })[],
  profiles: ReadonlyMap<string, UserProfile>,
): Map<string, KanbanPerson[]> {
  const byId = new Map<string, KanbanPerson[]>();
  for (const conv of convs) {
    const people = buildMissionPeople(conv, profiles);
    if (people.length > 0) byId.set(conv.id, people);
  }
  return byId;
}

/**
 * Attach the server-stamped face stacks (from {@link buildBoardPeopleById}) to
 * board items by id. Identity pass-through when the map is empty — single
 * player / desktop never resolves attribution, so the items array (and its
 * reference) stays byte-identical and memoized children never re-render.
 */
export function attachBoardPeople(
  items: KanbanItem[],
  peopleById: ReadonlyMap<string, KanbanPerson[]>,
): KanbanItem[] {
  if (peopleById.size === 0) return items;
  return items.map((item) => {
    const people = peopleById.get(item.id);
    return people ? { ...item, people } : item;
  });
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
