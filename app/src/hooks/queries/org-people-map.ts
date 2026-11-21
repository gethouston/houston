import type { MentionPerson } from "@houston-ai/chat";

export interface OrgPersonRow {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

export function toMentionPeople(
  people: readonly OrgPersonRow[],
): MentionPerson[] {
  const out: MentionPerson[] = [];
  for (const person of people) {
    const name = person.displayName?.normalize("NFC").trim();
    if (!name) continue;
    out.push({
      userId: person.userId,
      name,
      ...(person.photoUrl ? { imageUrl: person.photoUrl } : {}),
    });
  }
  return out;
}

export function excludeSelf(
  people: readonly MentionPerson[],
  selfUserId: string | null | undefined,
): readonly MentionPerson[] {
  if (!selfUserId) return people;
  if (!people.some((p) => p.userId === selfUserId)) return people;
  return people.filter((p) => p.userId !== selfUserId);
}
