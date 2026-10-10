import markUrl from "../../assets/houston-black.svg";
import type { ChartPerson } from "./org-chart-people";
import { CARD } from "./org-chart-share-card-geometry";
import {
  paintShareCard,
  type ShareCardAssets,
  type ShareCardText,
} from "./org-chart-share-card-paint";
import { type CardWords, shareCardLayout } from "./org-chart-share-layout";
import type { OrgTree } from "./org-chart-tree";

/**
 * The share image as a PNG. Drawn with the Canvas 2D API alone: no
 * html-to-image or SVG foreignObject, because WebKit (the desktop app's
 * WKWebView) taints any canvas that draws one and the PNG could never be
 * read back out.
 *
 * Person photos load with `crossOrigin="anonymous"`, so a host that does not
 * allow it fails the load instead of tainting the canvas. Each photo is
 * also read back on a scratch canvas before it is used: one bad photo
 * becomes initials, it never fails the whole image. A photo that is slow to
 * load is given up on after {@link PHOTO_TIMEOUT_MS}.
 */

const PHOTO_TIMEOUT_MS = 4000;

function loadImage(
  src: string,
  cors: boolean,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    const timer = setTimeout(() => resolve(null), PHOTO_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    // A photo that will not load is drawn as initials: expected, not a bug.
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

/** Whether drawing `image` leaves a canvas readable. */
function drawsClean(image: HTMLImageElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(image, 0, 0, 1, 1);
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch (error) {
    // A tainting photo throws SecurityError here; any other error is a bug.
    if (error instanceof DOMException && error.name === "SecurityError")
      return false;
    throw error;
  }
}

function peopleOn(tree: OrgTree): ChartPerson[] {
  const people = tree.branches.map((branch) => branch.person);
  return tree.root.kind === "person" ? [tree.root.person, ...people] : people;
}

async function loadAssets(tree: OrgTree): Promise<ShareCardAssets> {
  const withPhotos = peopleOn(tree).filter((p) => p.imageUrl);
  const [mark, ...photos] = await Promise.all([
    loadImage(markUrl, false),
    ...withPhotos.map((p) => loadImage(p.imageUrl ?? "", true)),
  ]);
  const clean = new Map<string, CanvasImageSource>();
  withPhotos.forEach((person, index) => {
    const photo = photos[index];
    if (photo && drawsClean(photo)) clean.set(person.userId, photo);
  });
  return { photos: clean, mark };
}

export class ShareCardError extends Error {
  override name = "ShareCardError";
}

/** Draw `tree` as the 1200 x 1200 share PNG. */
export async function renderShareCard(
  tree: OrgTree,
  text: ShareCardText,
  words: CardWords,
): Promise<Blob> {
  const assets = await loadAssets(tree);
  const canvas = document.createElement("canvas");
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ShareCardError("canvas 2d context unavailable");
  paintShareCard(ctx, shareCardLayout(tree, words), text, assets);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ShareCardError("canvas produced no PNG"));
    }, "image/png"),
  );
}
