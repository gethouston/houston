import type { Frame, Page } from "playwright-core";
import { unquoteItemKeys } from "./aria-keys";
import {
  documentOf,
  lookEpoch,
  previousRefs,
  rememberLook,
} from "./look-memory";
import { maskPasswords } from "./mask-passwords";
import type { BrowserTab } from "./open-tab";
import { redactUrl } from "./redact-url";
import { nextGeneration, stampRefs } from "./refs";
import { FULL_VIEW, type SnapshotView, viewTree } from "./snapshot-view";
import { untrusted } from "./untrusted";

export const SNAPSHOT_MAX_CHARS = 12_000;

export function capText(
  text: string,
  max = SNAPSHOT_MAX_CHARS,
): { kept: string; omitted: number } {
  if (text.length <= max) return { kept: text, omitted: 0 };
  const cut = text.lastIndexOf("\n", max);
  const kept = text.slice(0, cut > 0 ? cut : max);
  return { kept, omitted: text.length - kept.length };
}

export const cutOffHint = (omitted: number) =>
  `[... page cut off: ${omitted} more characters not shown. Take a snapshot with query to find something specific, or with interactive: true for only the controls.]`;

export async function pageSnapshot(
  tab: BrowserTab,
  view: SnapshotView = FULL_VIEW,
  epoch = lookEpoch(tab),
): Promise<string> {
  const page = tab.page;
  const secrets = await passwordValues(page);
  const tree = await ariaTree(page);
  const title = await page.title();
  const address = redactUrl(page.url());
  const document = tree === null ? null : await documentOf(page);
  const shaped =
    tree === null || document === null
      ? null
      : viewTree({
          tree: maskPasswords(tree, secrets),
          view,
          pageUrl: page.url(),
          previous: previousRefs(tab, page, document),
        });
  const generation = nextGeneration();
  if (tab.page === page && lookEpoch(tab) === epoch) {
    tab.generation = generation;
    if (shaped && document !== null)
      rememberLook(tab, page, document, shaped.refs);
  }
  const head = `Page: ${title}\nAddress: ${address}`;
  if (!shaped) return `${STILL_LOADING}\n${untrusted(head)}`;
  const { kept, omitted } = capText(stampRefs(shaped.tree, generation));
  return [
    ...shaped.notes,
    untrusted(`${head}\n\n${kept}`),
    ...(omitted > 0 ? [cutOffHint(omitted)] : []),
  ].join("\n");
}

export async function passwordValues(page: Page): Promise<string[]> {
  const perFrame = await Promise.all(page.frames().map(framePasswords));
  return perFrame.flat();
}

const readPasswords = (frame: Frame): Promise<string[]> =>
  frame
    .locator('input[type="password"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );

async function framePasswords(frame: Frame): Promise<string[]> {
  try {
    return await readPasswords(frame);
  } catch {
    if (frame.isDetached()) return [];
    try {
      return await readPasswords(frame);
    } catch (retryError) {
      if (frame.isDetached()) return [];
      throw retryError;
    }
  }
}

export const STILL_LOADING =
  "(The page is still loading and has nothing to read yet. Wait a few seconds, then take a snapshot again.)";

export async function ariaTree(page: Page): Promise<string | null> {
  try {
    return unquoteItemKeys(
      await page.ariaSnapshot({ mode: "ai", timeout: 5_000 }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return null;
    throw error;
  }
}
