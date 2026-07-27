import type { KanbanPerson } from "./types";

/** Faces shown on the card's people overlay (bottom-right of the card body)
 *  before collapsing into an expandable "+N" chip. Wider than the inline
 *  detail-panel stack, so it shows more faces (~5) before overflowing. */
export const CARD_PEOPLE_MAX = 5;

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

/** Circles the card's stack actually paints: the visible faces plus the "+N"
 *  chip, which occupies one more slot. */
export function stackSlots(people: KanbanPerson[], max: number): number {
  return (
    visiblePeople(people, max).length + (overflowCount(people, max) > 0 ? 1 : 0)
  );
}

/**
 * Right gutter the card body reserves for the bottom-right face stack, as a
 * Tailwind padding utility (never a raw px literal). Mirrors the landing mock's
 * `.tc-desc { padding-right: 44px }`: without it the last line of the
 * description runs underneath the faces.
 *
 * Sized to the stack it has to clear, rounded UP to the sanctioned spacing
 * scale (DESIGN.md §4), rather than capped: an opaque face hides the text under
 * it just as thoroughly as a translucent one garbled it, so "the tail of the
 * sentence is gone" is not an acceptable trade for a wider description. The
 * stack is `18px` circles overlapped by `6px`, each carrying a `2px` ring that
 * bleeds outward, so N circles paint `N * 12 + 10` px; each tier is the first
 * scale step at or above that (22->24, 34->40, 46->48, 58->64, 70->80,
 * 82->96) — rounding up only ever adds clearance. N never exceeds
 * {@link CARD_PEOPLE_MAX} + 1 (the faces plus the "+N" chip).
 *
 * Returns `""` for an unattributed card so its body class list — and therefore
 * a single-player board — stays byte-identical.
 */
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
