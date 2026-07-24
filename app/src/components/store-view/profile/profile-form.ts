import type {
  CreatorLinks,
  CreatorProfile,
  CreatorProfilePatch,
} from "@houston-ai/engine-client";

/**
 * Pure form logic for the creator-profile editor, split out from the dialog so
 * the "only send what changed" patch builder and the link/bio validators are
 * unit-testable without a DOM (the editor's JSX is exercised by the app tests).
 * Deliberately free of any runtime workspace-package import so the node test
 * runner loads it with zero resolution cost.
 */

/** The social platforms the profile exposes, in display order. Mirrors the
 *  gateway `SocialLinks` (`CreatorLinks`) keys. */
export const SOCIAL_PLATFORMS = [
  "x",
  "youtube",
  "tiktok",
  "instagram",
  "github",
  "linkedin",
  "website",
] as const;

/** One of the seven social-link keys. */
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Gateway cap on the bio length; enforced client-side so `bio_too_long` never
 *  round-trips. */
export const MAX_BIO = 500;

/** The editor's editable fields; `handle` is expected already normalized. */
export interface ProfileFormValues {
  handle: string;
  displayName: string;
  bio: string;
  links: CreatorLinks;
}

/**
 * Whether a single social value is an acceptable link: empty (the field is
 * optional, an absent link is an absent key) or a well-formed `https` URL. Any
 * other scheme (`http`, `javascript:`, `mailto:`) or unparseable text is
 * rejected so the gateway never has to bounce an `invalid_link`.
 */
export function isValidHttpsUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") return true;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return url.protocol === "https:";
}

/** Whether ANY of the seven links is present but not a valid `https` URL. */
export function hasInvalidLink(links: CreatorLinks): boolean {
  return SOCIAL_PLATFORMS.some((p) => !isValidHttpsUrl(links[p] ?? ""));
}

/** Value-equality over the seven link slots, treating absent and `""` alike. */
export function linksEqual(a: CreatorLinks, b: CreatorLinks): boolean {
  return SOCIAL_PLATFORMS.every((p) => (a[p] ?? "") === (b[p] ?? ""));
}

/**
 * The minimal `PATCH /me/profile` body: only fields that actually differ from
 * the current profile. Crucially the `handle` is omitted when unchanged, so
 * merely saving a bio edit can never trip the gateway's `handle_change_too_soon`
 * rate limit. `displayName` is trimmed and sent only when it differs from the
 * baseline: a blank display name on claim sends NO `displayName` (so the gateway
 * defaults it to the handle), while clearing a previously set name sends `""`
 * (which the gateway likewise resets to the handle).
 */
export function buildProfilePatch(
  form: ProfileFormValues,
  current: CreatorProfile | null,
): CreatorProfilePatch {
  const patch: CreatorProfilePatch = {};
  if (form.handle !== (current?.handle ?? "")) patch.handle = form.handle;
  const displayName = form.displayName.trim();
  if (displayName !== (current?.displayName ?? ""))
    patch.displayName = displayName;
  if (form.bio !== (current?.bio ?? "")) patch.bio = form.bio;
  if (!linksEqual(form.links, current?.links ?? {})) patch.links = form.links;
  return patch;
}

/** Inputs that decide whether the editor's primary Save action is enabled. The
 *  caller precomputes `handleValid` (grammar + reservation, which need the
 *  contract package) so this stays a pure, dependency-light predicate. */
export interface SaveGateInputs {
  /** True on the first-claim flow (the profile has no handle yet). */
  claiming: boolean;
  /** Whether the normalized handle differs from the current profile's handle. */
  handleChanged: boolean;
  /** Whether the normalized handle passes grammar and is not reserved. */
  handleValid: boolean;
  /** The current social links, for the invalid-URL guard. */
  links: CreatorLinks;
  /** Whether a save is already in flight. */
  saving: boolean;
}

/**
 * Whether the editor's Save button may be enabled. A valid handle is REQUIRED on
 * the claim flow: an empty handle leaves it unchanged from the null baseline, so
 * gating on "changed" alone would enable Save and round-trip a handle-less patch
 * that the gateway bounces with `invalid_handle` against a blank field. When
 * editing an existing profile an unchanged handle is fine; a changed one must be
 * valid. Only valid links are additionally required — the display name is
 * optional, since the gateway defaults a blank one to the `@handle`.
 */
export function canSaveProfile(inputs: SaveGateInputs): boolean {
  const handleOk = inputs.claiming
    ? inputs.handleValid
    : !inputs.handleChanged || inputs.handleValid;
  return handleOk && !hasInvalidLink(inputs.links) && !inputs.saving;
}
