/**
 * Deterministic tone assignment for HUMAN avatar faces (the mission face
 * stack). Pure and JSX-free so it runs under `node --experimental-strip-types`
 * in `../tests/kanban-people-tone.test.ts`.
 *
 * Why a hash and not a rotating index: the same teammate must wear the same
 * colour on EVERY card, in every column, on both boards, and in the expansion
 * popover. An index into the render order would recolour a person the moment a
 * mission gains or loses another contributor. Hashing the person's stable id
 * makes the tone a property of the person, not of the list they appear in.
 *
 * The five tones are deliberately DESATURATED (slate / sage / mauve / taupe /
 * indigo) so a human face never competes with the vivid `agent.*` helmet
 * palette — teammates are context, the agent is the subject.
 */

/** The person-tone background utilities, in palette order. */
export const PERSON_TONE_CLASSES = [
  "bg-person-slate",
  "bg-person-sage",
  "bg-person-mauve",
  "bg-person-taupe",
  "bg-person-indigo",
] as const;

export type PersonToneClass = (typeof PERSON_TONE_CLASSES)[number];

/**
 * FNV-1a over the id's UTF-16 code units, folded to a palette index. Chosen
 * over `sum(charCodes)` because contributor ids are long, near-identical
 * strings (`u-alice`, `u-alexis`) whose character sums collide constantly —
 * FNV-1a's multiply-and-mix spreads those onto different tones. `Math.imul`
 * keeps the 32-bit multiply exact in JS.
 */
export function personToneIndex(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % PERSON_TONE_CLASSES.length;
}

/** The background utility this person's initials avatar wears, everywhere. */
export function personToneClass(id: string): PersonToneClass {
  return PERSON_TONE_CLASSES[personToneIndex(id)];
}
