/**
 * The helper behind Settings > Profile > "Change picture": turn whatever image
 * the user picked into the small square data URI the gateway stores. The
 * gateway accepts `data:image/(png|jpeg|webp);base64,` up to 150000 chars, so
 * a 12 MB phone photo is never rejected here, it is shrunk until it fits.
 * Failures are TYPED, never prose: the caller maps an {@link AvatarImageError}
 * `kind` to a localized string. Only {@link fileToAvatarDataUrl} touches the
 * DOM, and only inside its body, so the size-cap search unit-tests under
 * `node --test`.
 *
 * The crop geometry and the decode ladder are NOT redefined here: both come
 * from `lib/image-crop.ts`, which the Agent Store's avatar upload already uses.
 * The only thing that differs between the two paths is the encoder — a blob for
 * the store's multipart POST, a capped data URI for this one.
 */

// Explicit `.ts` so this module resolves under `node --experimental-strip-types`
// (the app's unit-test runner), matching every other node-tested `lib/` module.
import { centerSquareCrop, decodeImage } from "./image-crop.ts";

/** The square edge, in CSS px, every avatar is normalized to. */
export const AVATAR_EDGE_PX = 256;

/**
 * Hard ceiling on the produced data URI, in characters. Comfortably under the
 * gateway's 150000 so a save can never be rejected for size.
 */
export const AVATAR_MAX_DATA_URL_CHARS = 100_000;

/** Encoder qualities tried in order, best first. */
export const AVATAR_QUALITY_STEPS: readonly number[] = [
  0.9, 0.8, 0.7, 0.6, 0.45,
];

/** Why a picked file could not become an avatar. */
export type AvatarImageError =
  | { kind: "notImage" }
  | { kind: "unreadable" }
  | { kind: "tooLarge" };

/**
 * Thrown by {@link fileToAvatarDataUrl} so the caller can map `kind` to a
 * localized string. The underlying failure rides along as `cause` for the bug
 * report — it is never swallowed.
 */
export class AvatarImageFailure extends Error {
  readonly reason: AvatarImageError;
  constructor(reason: AvatarImageError, options?: ErrorOptions) {
    super(reason.kind, options);
    this.name = "AvatarImageFailure";
    this.reason = reason;
  }
}

/**
 * True for a file the picker should accept at all (an `image/*` MIME type).
 * Deliberately prefix-only: `image/heic` and every other exotic format the
 * browser can decode gets its chance rather than dying on a codec allowlist.
 */
export function isAvatarImageFile(file: { type: string }): boolean {
  return file.type.toLowerCase().startsWith("image/");
}

/**
 * Byte length of a base64 data URI's payload (what "under 100KB" actually means
 * to a reader). Padding (`=`) carries no bytes. 0 for an empty payload. PURE.
 */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const payload = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  if (payload.length === 0) return 0;
  let padding = 0;
  while (
    padding < payload.length &&
    payload[payload.length - 1 - padding] === "="
  ) {
    padding += 1;
  }
  return Math.floor((payload.length * 3) / 4) - padding;
}

/**
 * Walk {@link AVATAR_QUALITY_STEPS} best-first and return the first encoding at
 * or under `maxChars`, or `null` when even the last one is too heavy. Each
 * quality is encoded at most once. The encoder is INJECTED so this is
 * unit-testable without a canvas. PURE.
 */
export function encodeUnderCap(
  encode: (quality: number) => string,
  maxChars: number = AVATAR_MAX_DATA_URL_CHARS,
): string | null {
  for (const quality of AVATAR_QUALITY_STEPS) {
    const encoded = encode(quality);
    if (encoded.length <= maxChars) return encoded;
  }
  return null;
}

/**
 * Encode the drawn canvas under the cap. WebP first; a browser that ignores the
 * request hands back a `data:image/png` instead, and a PNG photo blows the cap,
 * so JPEG gets its own full pass through {@link encodeUnderCap}. `tooLarge` is
 * reported only when NEITHER attempt produced something that fits.
 */
function encodeAvatarCanvas(canvas: HTMLCanvasElement): string {
  const webp = encodeUnderCap((q) => canvas.toDataURL("image/webp", q));
  if (webp !== null && !webp.startsWith("data:image/png")) return webp;
  const jpeg = encodeUnderCap((q) => canvas.toDataURL("image/jpeg", q));
  if (jpeg !== null) return jpeg;
  // Both requests were ignored, but the PNG the browser substituted did fit —
  // the gateway takes png/jpeg/webp alike, so keep it rather than fail.
  if (webp !== null) return webp;
  throw new AvatarImageFailure({ kind: "tooLarge" });
}

/**
 * Browser entry point: decode `file`, centre-square-crop it, draw it at
 * {@link AVATAR_EDGE_PX}, and encode under the cap. Rejects with an
 * {@link AvatarImageFailure} carrying a typed reason — the shared decoder's own
 * rejection is re-thrown as `{kind:"unreadable"}` with the real cause attached,
 * never swallowed.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!isAvatarImageFile(file)) {
    throw new AvatarImageFailure({ kind: "notImage" });
  }
  const decoded = await decodeImage(file).catch((cause: unknown) => {
    throw new AvatarImageFailure({ kind: "unreadable" }, { cause });
  });
  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new AvatarImageFailure({ kind: "unreadable" });
    }
    const { sx, sy, size } = centerSquareCrop(decoded.width, decoded.height);
    const edge = AVATAR_EDGE_PX;
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext("2d");
    if (!context) throw new AvatarImageFailure({ kind: "unreadable" });
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.image, sx, sy, size, size, 0, 0, edge, edge);
    return encodeAvatarCanvas(canvas);
  } finally {
    decoded.release();
  }
}
