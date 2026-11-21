import { centerSquareCrop, decodeImage } from "./image-crop.ts";

export const AVATAR_EDGE_PX = 256;

export const AVATAR_MAX_DATA_URL_CHARS = 100_000;

export const AVATAR_QUALITY_STEPS: readonly number[] = [
  0.9, 0.8, 0.7, 0.6, 0.45,
];

export type AvatarImageError =
  | { kind: "notImage" }
  | { kind: "unreadable" }
  | { kind: "tooLarge" };

export class AvatarImageFailure extends Error {
  readonly reason: AvatarImageError;
  constructor(reason: AvatarImageError, options?: ErrorOptions) {
    super(reason.kind, options);
    this.name = "AvatarImageFailure";
    this.reason = reason;
  }
}

export function isAvatarImageFile(file: { type: string }): boolean {
  return file.type.toLowerCase().startsWith("image/");
}

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

function encodeAvatarCanvas(canvas: HTMLCanvasElement): string {
  const webp = encodeUnderCap((q) => canvas.toDataURL("image/webp", q));
  if (webp !== null && !webp.startsWith("data:image/png")) return webp;
  const jpeg = encodeUnderCap((q) => canvas.toDataURL("image/jpeg", q));
  if (jpeg !== null) return jpeg;
  if (webp !== null) return webp;
  throw new AvatarImageFailure({ kind: "tooLarge" });
}

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
