import markUrl from "../../assets/houston-black.svg";
import type { ChartPerson } from "./org-chart-people";
import { PORTRAIT_FRAME } from "./org-chart-share-card-geometry";
import {
  paintShareCard,
  type ShareCardAssets,
  type ShareCardText,
} from "./org-chart-share-card-paint";
import type { CardWords } from "./org-chart-share-columns";
import { shareCardLayout } from "./org-chart-share-layout";
import type { OrgTree } from "./org-chart-tree";

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
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

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

export async function drawShareCanvas(
  tree: OrgTree,
  text: ShareCardText,
  words: CardWords,
): Promise<HTMLCanvasElement> {
  const frame = PORTRAIT_FRAME;
  const assets = await loadAssets(tree);
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ShareCardError("canvas 2d context unavailable");
  paintShareCard(ctx, shareCardLayout(tree, words, frame), text, assets, frame);
  return canvas;
}

export async function renderShareCard(
  tree: OrgTree,
  text: ShareCardText,
  words: CardWords,
): Promise<Blob> {
  const canvas = await drawShareCanvas(tree, text, words);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ShareCardError("canvas produced no PNG"));
    }, "image/png"),
  );
}
