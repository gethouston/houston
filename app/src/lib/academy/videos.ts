export const ACADEMY_VIDEO_BASE_URL = "https://gethouston.ai/academy/videos/";

interface AcademyVideoAsset {
  src: string;
  posterSrc: string | null;
  durationSeconds: number;
}

export const ACADEMY_VIDEO_MANIFEST: Record<string, AcademyVideoAsset> = {};

export interface AcademyVideo {
  id: string;
  src: string | null;
  posterSrc: string | null;
  durationSeconds: number | null;
}

export function academyAssetUrl(path: string): string {
  return new URL(path, ACADEMY_VIDEO_BASE_URL).toString();
}

export function academyVideo(id: string): AcademyVideo {
  if (!Object.hasOwn(ACADEMY_VIDEO_MANIFEST, id))
    return { id, src: null, posterSrc: null, durationSeconds: null };
  const asset = ACADEMY_VIDEO_MANIFEST[id];
  return {
    id,
    src: academyAssetUrl(asset.src),
    posterSrc:
      asset.posterSrc === null ? null : academyAssetUrl(asset.posterSrc),
    durationSeconds: asset.durationSeconds,
  };
}

export function formatVideoDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const rest = total % 60;
  return `${Math.floor(total / 60)}:${String(rest).padStart(2, "0")}`;
}
