import type { KanbanPerson } from "@houston-ai/board";
import type { UserProfile } from "../hooks/queries/use-user-profiles";

export interface MissionAttribution {
  created_by?: string;
  contributors?: { user_id: string; name?: string }[];
}

export function shortUserLabel(userId: string): string {
  return userId.slice(0, 8);
}

export function buildMissionPeople(
  conv: MissionAttribution,
  profiles: ReadonlyMap<string, UserProfile>,
): KanbanPerson[] {
  const contributorName = new Map<string, string | undefined>();
  for (const c of conv.contributors ?? []) {
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
    const label =
      profile?.name ?? contributorName.get(id) ?? shortUserLabel(id);
    const imageUrl = profile?.avatarUrl ?? undefined;
    return imageUrl ? { id, label, imageUrl } : { id, label };
  });
}

export function collectContributorIds(convs: MissionAttribution[]): string[] {
  const ids = new Set<string>();
  for (const conv of convs) {
    if (conv.created_by) ids.add(conv.created_by);
    for (const c of conv.contributors ?? []) ids.add(c.user_id);
  }
  return Array.from(ids);
}

export function missionMatchesPerson(
  people: KanbanPerson[] | undefined,
  userId: string,
): boolean {
  return (people ?? []).some((p) => p.id === userId);
}

export function missionMatchesMe(
  people: KanbanPerson[] | undefined,
  selfId: string,
): boolean {
  return (people ?? []).length === 0 || missionMatchesPerson(people, selfId);
}

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
