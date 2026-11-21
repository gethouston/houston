import type { KanbanPerson } from "./types";

export const CARD_PEOPLE_MAX = 5;

export function hasPeopleBeyond(
  people: KanbanPerson[] | undefined,
  selfId: string | undefined,
): boolean {
  return !!people && people.some((person) => person.id !== selfId);
}

export function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]];
  const letters =
    words.length === 1
      ? first.slice(0, 2).join("")
      : `${first[0]}${[...words[words.length - 1]][0]}`;
  return letters.toUpperCase() || "?";
}

export function visiblePeople(
  people: KanbanPerson[],
  max: number,
): KanbanPerson[] {
  return people.slice(0, Math.max(0, max));
}

export function overflowCount(people: KanbanPerson[], max: number): number {
  return Math.max(0, people.length - Math.max(0, max));
}

export function stackSlots(people: KanbanPerson[], max: number): number {
  return (
    visiblePeople(people, max).length + (overflowCount(people, max) > 0 ? 1 : 0)
  );
}

const PEOPLE_GUTTER = [
  "",
  "pr-6",
  "pr-10",
  "pr-12",
  "pr-16",
  "pr-20",
  "pr-24",
] as const;

export function peopleGutterClass(slots: number): string {
  if (slots <= 0) return "";
  return PEOPLE_GUTTER[Math.min(slots, PEOPLE_GUTTER.length - 1)];
}
