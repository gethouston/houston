import { LINKEDIN_IMAGE_MAX_BYTES } from "@houston/wire-types";

export function postableImage(
  png: File,
  toJpeg: (png: File) => Promise<Blob>,
  maxBytes = LINKEDIN_IMAGE_MAX_BYTES,
): Promise<Blob> {
  return png.size <= maxBytes ? Promise.resolve(png) : toJpeg(png);
}

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
