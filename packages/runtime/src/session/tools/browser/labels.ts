import { randomUUID } from "node:crypto";
import type { Page } from "playwright-core";
import { isClosedError } from "./live/page-errors";
import { lookEpoch } from "./look-memory";
import type { BrowserTab } from "./open-tab";
import { nextGeneration } from "./refs";
import { ariaTree } from "./snapshot";
import { parseTree, walk } from "./snapshot-tree";
import { isInteractive } from "./snapshot-view";

export const MAX_LABELS = 80;
const MAX_MEASURED = 400;
const MEASURE_TIMEOUT_MS = 1_000;

export interface ScreenLabel {
  ref: string;
  role: string;
  name: string;
}

interface Badge {
  text: string;
  x: number;
  y: number;
}

export async function labeledScreenshot(
  tab: BrowserTab,
  shoot: (page: Page) => Promise<Buffer>,
): Promise<{ image: Buffer; labels: ScreenLabel[] }> {
  const page = tab.page;
  const epoch = lookEpoch(tab);
  const tree = await ariaTree(page);
  const controls = tree
    ? [...walk(parseTree(tree))]
        .filter((n) => n.ref !== undefined && isInteractive(n))
        .slice(0, MAX_MEASURED)
    : [];
  const viewport = page.viewportSize();
  const measured = await Promise.all(
    controls.map(async (node) => ({
      node,
      box: await boxOf(page, node.ref ?? ""),
    })),
  );
  const generation = nextGeneration();
  if (tab.page === page && lookEpoch(tab) === epoch)
    tab.generation = generation;
  const visible = measured
    .flatMap(({ node, box }) =>
      box && viewport && onScreen(box, viewport) ? [{ node, box }] : [],
    )
    .slice(0, MAX_LABELS);
  const labels = visible.map(({ node }) => ({
    ref: `s${generation}${node.ref}`,
    role: node.role,
    name: node.name ?? "",
  }));
  const badges: Badge[] = visible.map(({ box }, i) => ({
    text: labels[i]?.ref ?? "",
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
  }));
  const id = `houston-labels-${randomUUID()}`;
  await page.evaluate(drawBadges, { id, badges });
  try {
    return { image: await shoot(page), labels };
  } finally {
    await removeBadges(page, id);
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(page: Page, ref: string): Promise<Box | null> {
  try {
    return await page
      .getByRef(ref)
      .boundingBox({ timeout: MEASURE_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return null;
    throw error;
  }
}

function onScreen(box: Box, viewport: { width: number; height: number }) {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x < viewport.width &&
    box.y < viewport.height &&
    box.x + box.width > 0 &&
    box.y + box.height > 0
  );
}

function drawBadges({ id, badges }: { id: string; badges: Badge[] }): void {
  const host = document.createElement("div");
  host.id = id;
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  for (const badge of badges) {
    const el = document.createElement("div");
    el.textContent = badge.text;
    el.style.cssText = `position:fixed;left:${badge.x}px;top:${badge.y}px;font:bold 11px/1.2 monospace;padding:1px 3px;background:yellow;color:black;border:1px solid black;border-radius:3px;white-space:nowrap;pointer-events:none;`;
    root.append(el);
  }
  document.documentElement.append(host);
}

async function removeBadges(page: Page, id: string): Promise<void> {
  try {
    await page.evaluate(
      (hostId) => document.getElementById(hostId)?.remove(),
      id,
    );
  } catch (error) {
    if (
      isClosedError(error) ||
      (error instanceof Error &&
        error.message.includes("Execution context was destroyed"))
    )
      return;
    throw error;
  }
}
