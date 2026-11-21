export const AVATAR_MAX_DIMENSION = 512;

export interface SquareCrop {
  sx: number;
  sy: number;
  size: number;
}

export function centerSquareCrop(width: number, height: number): SquareCrop {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

export function outputEdge(
  cropSize: number,
  max: number = AVATAR_MAX_DIMENSION,
): number {
  return Math.min(cropSize, max);
}

export interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export async function decodeImage(source: Blob): Promise<DecodedImage> {
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
    URL.revokeObjectURL(url);
  }
}

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
