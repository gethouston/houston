// The Academy's concept videos: one short recording opens a lesson, then the
// practice happens in the app.
//
// HOSTING IS NOT DECIDED YET and no asset is published, so every lesson asks
// for its video and gets an honest "nothing here" back — the card degrades to
// its placeholder and the lesson still runs. When the recordings ship, THIS
// MANIFEST IS THE ONLY PLACE THAT CHANGES: one row per lesson, file names
// relative to the base URL. No component, hook or lesson definition learns a
// URL, so moving the assets to another CDN later is a one-line edit here.

/**
 * Where published Academy assets live. The trailing slash is load-bearing:
 * rows are resolved against it as a directory. A row may also carry an
 * absolute URL, which wins over this base (an asset that lands on a different
 * host does not force the rest to move).
 */
export const ACADEMY_VIDEO_BASE_URL = "https://gethouston.ai/academy/videos/";

/** One published recording. Paths are relative to {@link ACADEMY_VIDEO_BASE_URL}. */
interface AcademyVideoAsset {
  src: string;
  /** The still frame shown before play. `null` while only the video exists. */
  posterSrc: string | null;
  /** Runtime in whole seconds, for the duration chip. */
  durationSeconds: number;
}

/**
 * Published recordings, keyed by lesson id. Empty until the founder's first
 * recordings are online; the commented row is the shape to copy.
 */
export const ACADEMY_VIDEO_MANIFEST: Record<string, AcademyVideoAsset> = {
  // "first-agent": {
  //   src: "first-agent.mp4",
  //   posterSrc: "first-agent.jpg",
  //   durationSeconds: 96,
  // },
};

/** A lesson's video as the UI sees it. Every field is null when unpublished. */
export interface AcademyVideo {
  id: string;
  src: string | null;
  posterSrc: string | null;
  durationSeconds: number | null;
}

/** Absolute URL for a manifest path, honouring an absolute row as-is. */
export function academyAssetUrl(path: string): string {
  return new URL(path, ACADEMY_VIDEO_BASE_URL).toString();
}

/**
 * The video for a lesson. An unknown or unpublished id is not an error: it
 * returns the all-null shape, which the card renders as its calm "coming soon"
 * state. Own-property lookup only, so an id like `toString` cannot resolve to
 * something off the prototype.
 */
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

/**
 * `m:ss`, the reading every video player has trained people on. Minutes are not
 * wrapped into hours — these are one- to two-minute concept videos, and a stray
 * long one reads truthfully as `61:01` rather than pretending to be a film.
 * Garbage in (NaN, Infinity, negative) reads as `0:00` instead of `NaN:NaN`.
 */
export function formatVideoDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const rest = total % 60;
  return `${Math.floor(total / 60)}:${String(rest).padStart(2, "0")}`;
}
