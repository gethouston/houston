/**
 * Pure wire-shape helpers for the space roster behind @mentions (HOU-944).
 *
 * Kept dependency-free (the one import is a type, erased at runtime) so the
 * `GET /v1/org/people` -> `MentionPerson[]` projection, the named-only filter
 * and the self exclusion are unit-tested under `node --test` without a live
 * client. Same precedent as `user-profiles-map.ts`.
 */

import type { MentionPerson } from "@houston-ai/chat";

/**
 * One row of the gateway's sanitized co-member directory (`OrgPerson` on the
 * wire): no email, no role, and BOTH display fields optional. Restated here as
 * a bare shape so this module imports no client; a live `OrgPerson` from
 * `@houston-ai/engine-client` structurally satisfies it.
 */
export interface OrgPersonRow {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

/**
 * The roster rows the composer and the renderer can actually use.
 *
 * A member with no `displayName` is DROPPED, not rendered under their id: the
 * `@` autocomplete inserts plain text, and "@a1b2c3d4" is nonsense to a
 * non-technical reader (see the `MentionPerson.name` contract). A blank or
 * whitespace-only name counts as no name for the same reason. Order is
 * preserved — the gateway already sorts named-first.
 *
 * Names are normalized to NFC here, at the boundary. "José" can arrive from
 * GCIP as one precomposed character or as "e" plus a combining accent; the
 * renderer measures a name's length to find its run in the message text, so
 * the two forms have to agree before either is written into a composer or
 * matched against a transcript.
 */
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
      // A member who never set a photo renders initials in their own tone.
      ...(person.photoUrl ? { imageUrl: person.photoUrl } : {}),
    });
  }
  return out;
}

/**
 * The COMPOSER's list: the roster minus the caller. You do not @mention
 * yourself, so the viewer never appears in the autocomplete — but they DO stay
 * in the render roster, so an agent reply saying "@Julian" still chips for
 * Julian. Signed out (`selfUserId` absent) nothing is excluded.
 *
 * Returns the input array itself when the caller isn't in it, so a roster that
 * needs no filtering keeps its identity and memoized consumers don't repaint.
 */
export function excludeSelf(
  people: readonly MentionPerson[],
  selfUserId: string | null | undefined,
): readonly MentionPerson[] {
  if (!selfUserId) return people;
  if (!people.some((p) => p.userId === selfUserId)) return people;
  return people.filter((p) => p.userId !== selfUserId);
}
