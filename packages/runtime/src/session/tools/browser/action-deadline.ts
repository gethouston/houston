import { BrowserToolError } from "./errors";
import type { BrowserTab } from "./open-tab";
import type { Slot } from "./pool-slot";
import { closeContext } from "./tab-pages";

export const ACTION_DEADLINE_MS = 60_000;

export const CLOSE_GRACE_MS = 10_000;

class DeadlineExceeded extends Error {}

export async function withinDeadline<T>(
  slot: Slot,
  work: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded()), ms);
  });
  try {
    return await Promise.race([work, expired]);
  } catch (error) {
    if (!(error instanceof DeadlineExceeded)) throw error;
    work.catch((reason: unknown) =>
      console.warn("[browser] a stuck action ended", String(reason)),
    );
    await abandon(slot);
    throw new BrowserToolError(
      "page_unresponsive",
      `The page stopped responding for ${Math.round(ms / 1000)} seconds, so the browser closed it. Sign-ins saved before this step are kept. Open the page again, or tell the person the site is not responding.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function settledWithin(
  work: Promise<unknown>,
  ms: number,
  what: string,
): Promise<boolean> {
  let grace: NodeJS.Timeout | undefined;
  const settled = await Promise.race([
    work.then(
      () => true,
      (error: unknown) => {
        console.error(`[browser] ${what} failed`, error);
        return null;
      },
    ),
    new Promise<false>((resolve) => {
      grace = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(grace);
  if (settled === false)
    console.error(`[browser] ${what} did not finish; left behind`);
  return settled === true;
}

async function abandon(slot: Slot): Promise<void> {
  const pending = [slot.tab, slot.spare];
  slot.tab = null;
  slot.spare = null;
  slot.epoch += 1;
  const close = async (opening: Promise<BrowserTab> | null) => {
    const tab = await opening?.catch(() => undefined);
    if (tab) await closeContext(tab);
  };
  await settledWithin(
    Promise.all(pending.map(close)),
    CLOSE_GRACE_MS,
    "closing a stuck context",
  );
}
