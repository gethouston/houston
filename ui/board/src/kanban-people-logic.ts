import type { KanbanPerson } from "./types";

/** Faces shown on the card's people overlay (bottom-right of the card body)
 *  before collapsing into an expandable "+N" chip. Wider than the inline
 *  detail-panel stack, so it shows more faces (~5) before overflowing. */
export const CARD_PEOPLE_MAX = 5;

export function hasPeopleBeyond(
  people: KanbanPerson[] | undefined,
  selfId: string | undefined,
): boolean {
  return !!people && people.some((person) => person.id !== selfId);
}

/** Up-to-two-initials derived from a display label. Splits on whitespace and
 *  takes the first letter of the first and last word (single word → first two
 *  letters); empty/letterless input falls back to "?". Pure, JSX-free so it can
 *  be unit-tested under `node --experimental-strip-types`.
 *
 *  Slices by CODE POINT (`[...word]`), not by UTF-16 code unit: this is the one
 *  initials helper behind board faces, chat sender faces and learning
 *  provenance faces, and a label starting with an astral character (an emoji, a
 *  rare CJK ideograph) would otherwise be cut mid-surrogate-pair and render as
 *  "�". */
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
