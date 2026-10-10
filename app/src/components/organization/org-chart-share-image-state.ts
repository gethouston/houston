import type { OrgTree } from "./org-chart-tree.ts";

/** Which share image the dialog may show. Pure and DOM-free. */

export type ShareImage =
  | { status: "drawing" }
  | { status: "failed" }
  | { status: "ready"; blob: Blob; url: string; file: File };

/** One draw's result, with what it was drawn for. */
export interface DrawnShareImage {
  tree: OrgTree;
  attempt: number;
  image: ShareImage;
}

const DRAWING: ShareImage = { status: "drawing" };

/**
 * The image the dialog may show: only a draw made for this very tree and
 * attempt while open. Anything else (a closed dialog, a tree that changed,
 * a retry under way) reads as drawing, so a released object URL or an old
 * blob is never shown or shared, not even for a frame.
 */
export function currentShareImage(
  drawn: DrawnShareImage | null,
  tree: OrgTree,
  attempt: number,
  open: boolean,
): ShareImage {
  if (!open || !drawn) return DRAWING;
  return drawn.tree === tree && drawn.attempt === attempt
    ? drawn.image
    : DRAWING;
}
