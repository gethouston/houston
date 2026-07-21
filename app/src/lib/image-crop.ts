/**
 * Client-side avatar preparation: take whatever image the user picked and turn
 * it into the square, downscaled WebP blob the gateway's `POST /me/avatar`
 * accepts (2 MiB max, png/jpeg/webp). Doing the crop and downscale in the
 * browser means a 4000px phone photo never travels the wire at full size, and
 * the stored avatar is always a clean centered square regardless of the source
 * aspect ratio.
 *
 * No new npm dependency: the crop runs on a plain `<canvas>`. The geometry is
 * split into pure functions ({@link centerSquareCrop}, {@link outputEdge}) so
 * the cropping math is unit-tested under `node --test` without a DOM.
 */

/** The longest edge (px) an avatar is downscaled to. Never upscales past it. */
export const AVATAR_MAX_DIMENSION = 512;

/** A square crop rectangle in source-image pixels. */
export interface SquareCrop {
  /** Left edge of the crop within the source image. */
  sx: number;
  /** Top edge of the crop within the source image. */
  sy: number;
  /** Edge length of the (square) crop. */
  size: number;
}

/**
 * The largest centered square that fits inside a `width` x `height` image. The
 * crop keeps the middle of the image and trims the longer axis evenly on both
 * sides, so a portrait or landscape photo becomes a square avatar without
 * distortion. Offsets are floored to whole pixels.
 */
export function centerSquareCrop(width: number, height: number): SquareCrop {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

/**
 * The output square's edge length: the crop size clamped DOWN to `max` so a
 * small source is never upscaled (which would only add blur and bytes) but a
 * large one is downscaled to the avatar ceiling.
 */
export function outputEdge(
  cropSize: number,
  max: number = AVATAR_MAX_DIMENSION,
): number {
  return Math.min(cropSize, max);
}

/** A decoded image plus the natural dimensions and a cleanup callback. */
interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode a blob into something `drawImage` accepts. Prefers `createImageBitmap`
 * (off-main-thread decode, releasable), falling back to an `<img>` + object URL
 * on engines without it. Rejects on an undecodable file so the caller surfaces
 * a real error rather than uploading garbage.
 */
async function decodeImage(source: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(source);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("avatar image could not be decoded"));
      img.src = url;
    });
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => {},
    };
  } finally {
    // Safe to revoke immediately: on success the pixels are already decoded
    // into memory; on failure the URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}

/**
 * Encode a canvas to a blob, preferring WebP and falling back to PNG on engines
 * that cannot encode WebP (some webviews). Rejects only when BOTH encoders
 * return null, so a null is never silently swallowed.
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp) {
        resolve(webp);
        return;
      }
      canvas.toBlob((png) => {
        if (png) resolve(png);
        else reject(new Error("canvas produced no blob for webp or png"));
      }, "image/png");
    }, "image/webp");
  });
}

/**
 * Center-square-crop and downscale a user-picked image to the avatar blob the
 * gateway accepts (WebP, PNG fallback, at most {@link AVATAR_MAX_DIMENSION}px
 * per side). Throws on an undecodable source or a canvas without a 2D context
 * so the upload flow can toast a real failure.
 */
export async function cropAvatarToBlob(source: Blob): Promise<Blob> {
  const decoded = await decodeImage(source);
  try {
    const { sx, sy, size } = centerSquareCrop(decoded.width, decoded.height);
    const edge = outputEdge(size);
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context is unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.image, sx, sy, size, size, 0, 0, edge, edge);
    return await canvasToBlob(canvas);
  } finally {
    decoded.release();
  }
}
