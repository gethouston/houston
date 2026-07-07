import type { KanbanPerson } from "./types";

/** Up-to-two-initials derived from a display label. Splits on whitespace and
 *  takes the first letter of the first and last word (single word → first two
 *  letters); empty/letterless input falls back to "?". Pure, JSX-free so it can
 *  be unit-tested under `node --experimental-strip-types`. */
export function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : `${words[0][0]}${words[words.length - 1][0]}`;
  return letters.toUpperCase() || "?";
}

/** The first `max` people to render as faces. Negative `max` yields none. */
export function visiblePeople(
  people: KanbanPerson[],
  max: number,
): KanbanPerson[] {
  return people.slice(0, Math.max(0, max));
}

/** How many people are hidden behind the "+N" overflow chip. */
export function overflowCount(people: KanbanPerson[], max: number): number {
  return Math.max(0, people.length - Math.max(0, max));
}
