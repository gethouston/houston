/**
 * Pure gateway-token → i18n-key maps for the creator-profile editor, split out
 * from `save-error.ts` (which imports the engine-client value to read the token)
 * so the node test runner loads these with zero resolution cost — the same split
 * `profile-form.ts` keeps for the form logic. Every known token gets specific,
 * friendly copy; only a genuinely unknown token falls back to a generic string,
 * and even that generic is scoped (save vs. photo) so no failure lies about what
 * broke.
 */

/** Handle-specific gateway tokens → the localized handle-field message key.
 *  A token absent from this map is a non-handle failure (→ a generic toast). */
export const HANDLE_ERROR_KEYS: Record<string, string> = {
  handle_taken: "profile.handleTaken",
  handle_reserved: "profile.handleReserved",
  invalid_handle: "profile.handleInvalid",
  handle_change_too_soon: "profile.handleChangeTooSoon",
};

/** Non-handle `PATCH /me/profile` tokens → their specific toast key. `bio_too_long`
 *  and `invalid_link` are also guarded client-side, so they only reach here on a
 *  contract skew; `user_not_found` covers the missing account row on first save. */
const SAVE_ERROR_KEYS: Record<string, string> = {
  bio_too_long: "profile.bioTooLong",
  invalid_link: "profile.invalidLink",
  display_name_required: "profile.displayNameRequired",
  user_not_found: "profile.saveFailedAccount",
};

/** Avatar `POST/DELETE /me/avatar` tokens → their specific toast key. `no_profile`
 *  reuses the claim hint (save the profile first); the three type/format tokens
 *  share the "use a PNG, JPEG or WebP" copy. */
const AVATAR_ERROR_KEYS: Record<string, string> = {
  no_profile: "profile.avatarClaimHint",
  image_too_large: "profile.avatarTooLarge",
  unsupported_media_type: "profile.avatarBadType",
  invalid_image: "profile.avatarBadType",
  no_file: "profile.avatarBadType",
};

/**
 * The toast key for a non-handle profile-save failure. Handle tokens are handled
 * field-level by the caller (via {@link HANDLE_ERROR_KEYS}); every other known
 * token gets specific copy, and an unknown/null token (network, session, a 500
 * "gateway error") falls back to the generic save copy.
 */
export function saveErrorKey(code: string | null): string {
  return (code && SAVE_ERROR_KEYS[code]) || "profile.saveFailed";
}

/**
 * The toast key for an avatar upload/remove failure. An unknown/null token falls
 * back to a photo-specific generic (`profile.avatarFailed`), never the
 * profile-save copy, so a photo failure never claims the whole profile failed.
 */
export function avatarErrorKey(code: string | null): string {
  return (code && AVATAR_ERROR_KEYS[code]) || "profile.avatarFailed";
}
