/**
 * The caller's own EDITABLE display profile: `GET`/`PUT /v1/me/profile`.
 *
 * Mirrors the closed cloud gateway's self-profile route — the one place a user
 * can override the name and photo their identity provider (Google) handed over,
 * so the faces their teammates see on missions, mentions and chat are the ones
 * they chose. The host repo never serves it: on desktop there is no one else to
 * be seen by, and the stored record lives above the engine.
 *
 * Both verbs answer the same shape: the EFFECTIVE `displayName`/`photoUrl` plus
 * a `custom` flag per field saying whether the value is the user's own or the
 * provider's. Validation is explicit and 400s with a reason — a silently
 * coerced name is a bug the e2e could never see.
 */

import { json } from "./http";
import * as state from "./state";

/** Display names are a UI label, not prose: one line, at most 60 characters. */
const MAX_DISPLAY_NAME = 60;
/** Photos ride inline as data URLs; the gateway caps the encoded payload. */
const MAX_PHOTO_URL = 150_000;
/** A remote photo must be https — an http URL would break the page's lock. */
const HTTPS_PHOTO = /^https:\/\//;
/** …or the inline upload the client encodes after cropping. */
const DATA_URL_PHOTO = /^data:image\/(png|jpeg|webp);base64,/;

/** A validated field: the value to store (`null` = clear), or why it was refused. */
type FieldResult = { value: string | null } | { error: string };

/** Validate `displayName`. Stores it TRIMMED — the stored name is what renders. */
function checkDisplayName(raw: unknown): FieldResult {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return { error: "displayName must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME)
    return {
      error: `displayName must be 1-${MAX_DISPLAY_NAME} characters`,
    };
  return { value: trimmed };
}

/** Validate `photoUrl`: an https URL or an inline png/jpeg/webp data URL. */
function checkPhotoUrl(raw: unknown): FieldResult {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return { error: "photoUrl must be a string" };
  if (raw.length > MAX_PHOTO_URL) return { error: "photoUrl is too large" };
  if (!HTTPS_PHOTO.test(raw) && !DATA_URL_PHOTO.test(raw))
    return {
      error: "photoUrl must be an https URL or a png/jpeg/webp data URL",
    };
  return { value: raw };
}

/** Route a self-profile request, or return `undefined` to fall through. */
export function handleMeRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (
    segs[0] !== "v1" ||
    segs[1] !== "me" ||
    segs[2] !== "profile" ||
    segs.length !== 3
  )
    return undefined;

  if (method === "GET") return json(state.getMyProfile());
  if (method !== "PUT") return json({ error: "not found" }, 404);

  // Only the keys the caller SENT are applied: omitted leaves the field alone,
  // `null` clears the override back to the identity provider's value. Building
  // the patch key-by-key is what preserves that three-way distinction.
  const patch: { displayName?: string | null; photoUrl?: string | null } = {};
  if (body && "displayName" in body) {
    const checked = checkDisplayName(body.displayName);
    if ("error" in checked) return json({ error: checked.error }, 400);
    patch.displayName = checked.value;
  }
  if (body && "photoUrl" in body) {
    const checked = checkPhotoUrl(body.photoUrl);
    if ("error" in checked) return json({ error: checked.error }, 400);
    patch.photoUrl = checked.value;
  }
  state.setMyProfileFields(patch);
  return json(state.getMyProfile());
}
