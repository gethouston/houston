import { json } from "./http";
import * as state from "./state";

const MAX_DISPLAY_NAME = 60;
const MAX_PHOTO_URL = 150_000;
const HTTPS_PHOTO = /^https:\/\//;
const DATA_URL_PHOTO = /^data:image\/(png|jpeg|webp);base64,/;

type FieldResult = { value: string | null } | { error: string };

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
