import {
  AVATAR_BUCKET,
  AVATAR_SIZE_PX,
  AvatarValidationFailure,
  avatarObjectPath,
  cacheBustedUrl,
  validateAvatarFile,
} from "./profile-avatar-core";
import { supabase } from "./supabase";

/**
 * Profile-picture upload: validate, center-crop to a square, downscale to
 * 256px, encode (webp, jpeg fallback), upload to `avatars/<uid>/avatar.<ext>`
 * with upsert, then write the cache-busted public URL onto profiles.avatar_url.
 *
 * The pure helpers (validation, path building, cache-busting) live in
 * `profile-avatar-core.ts` and are re-exported here; they are unit-tested
 * without a live Supabase client. `uploadAvatar` NEVER swallows a failure:
 * validation throws a typed {@link AvatarValidationFailure} the UI maps to
 * localized copy, and every storage/profile failure re-throws the server's own
 * message so the UI can surface the real reason (e.g. the "avatars" bucket not
 * existing before the migration is applied) instead of a generic mask.
 */

export type {
  AvatarFileMeta,
  AvatarValidationError,
} from "./profile-avatar-core";
export {
  AVATAR_BUCKET,
  AVATAR_SIZE_PX,
  AvatarValidationFailure,
  avatarObjectPath,
  cacheBustedUrl,
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "./profile-avatar-core";

interface EncodedImage {
  blob: Blob;
  ext: "webp" | "jpg";
  contentType: string;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Center-crop to a square, downscale to 256px, encode webp (jpeg fallback). */
async function cropSquareEncode(file: File): Promise<EncodedImage> {
  // createImageBitmap decodes without a DOM <img> round-trip and honors EXIF
  // orientation on recent engines; supported in every target webview.
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "This browser can't process images (no canvas 2D context).",
      );
    }

    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    );

    const webp = await canvasToBlob(canvas, "image/webp", 0.9);
    if (webp) return { blob: webp, ext: "webp", contentType: "image/webp" };
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.9);
    if (jpeg) return { blob: jpeg, ext: "jpg", contentType: "image/jpeg" };
    throw new Error("This browser couldn't encode the image.");
  } finally {
    bitmap.close();
  }
}

/**
 * Full upload flow. Returns the cache-busted public URL now stored on the
 * user's profile. Throws on any failure (never swallows): {@link
 * AvatarValidationFailure} for client rejections, or an `Error` carrying the
 * Supabase server message for storage/profile failures.
 */
export async function uploadAvatar(params: {
  userId: string;
  file: File;
}): Promise<string> {
  const { userId, file } = params;

  const invalid = validateAvatarFile(file);
  if (invalid) throw new AvatarValidationFailure(invalid);

  const encoded = await cropSquareEncode(file);
  const path = avatarObjectPath(userId, encoded.ext);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, encoded.blob, {
      upsert: true,
      contentType: encoded.contentType,
      cacheControl: "3600",
    });
  if (uploadError) throw new Error(uploadError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const url = cacheBustedUrl(publicUrl, Date.now());

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("user_id", userId);
  if (profileError) throw new Error(profileError.message);

  return url;
}
