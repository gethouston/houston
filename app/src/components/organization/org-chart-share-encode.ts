import { LINKEDIN_IMAGE_MAX_BYTES } from "@houston/wire-types";

/**
 * The picture a post sends: the drawn PNG when it fits LinkedIn's cap, else
 * the same picture as a JPEG (photos can make a busy chart heavy; a JPEG at
 * this size always fits). Download image and Copy image keep the PNG: a
 * clipboard only takes PNGs. DOM-free: the re-encoder is handed in.
 */
export function postableImage(
  png: File,
  toJpeg: (png: File) => Promise<Blob>,
  maxBytes = LINKEDIN_IMAGE_MAX_BYTES,
): Promise<Blob> {
  return png.size <= maxBytes ? Promise.resolve(png) : toJpeg(png);
}

/** `png` redrawn as a JPEG through a canvas. */
export async function jpegOf(png: File): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas produced no JPEG")),
      "image/jpeg",
      0.9,
    ),
  );
}
