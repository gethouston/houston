/**
 * Sample portrait for the avatar specimens.
 *
 * `Avatar`/`AgentAvatar` take an image URL, and the showcase must render with
 * no network — so the samples are inline `data:` SVGs rather than remote
 * photos. The colours inside them are *image content* (the pixels a real user
 * photo would supply), not component styling: nothing here paints a Houston
 * surface, and every avatar sits on its own opaque disc so both themes read
 * identically.
 */

/** A neutral silhouette portrait — stands in for a member's uploaded photo. */
export const SAMPLE_PERSON_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23d5d8dd'/%3E%3Ccircle cx='32' cy='25' r='11' fill='%238b9099'/%3E%3Cpath d='M8 61c3.5-12.5 12.6-19 24-19s20.5 6.5 24 19z' fill='%238b9099'/%3E%3C/svg%3E";

/** A flat agent glyph — stands in for a published agent's icon. */
export const SAMPLE_AGENT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%232f3238'/%3E%3Ccircle cx='32' cy='32' r='16' fill='none' stroke='%23e6e8eb' stroke-width='3'/%3E%3Ccircle cx='32' cy='32' r='5' fill='%23e6e8eb'/%3E%3C/svg%3E";

/** A URL that will never resolve — proves the fallback path in `AvatarImage`. */
export const BROKEN_AVATAR_URL = "data:image/svg+xml,not-an-image";
