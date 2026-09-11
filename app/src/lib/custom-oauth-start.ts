import type { ReservedTab } from "./browser-tab.ts";
import { retryWhileWaking } from "./waking-retry.ts";

/**
 * The client half of a custom integration's browser sign-in (PRODUCT-1172):
 * mint the authorize URL on the host, then hand it to the browser.
 *
 * Three ways this used to end as "I pressed Sign in and nothing happened":
 *  - the web build's popup blocker refused the `window.open` issued after the
 *    async mint (Safari, Firefox, strict Chrome), and the refusal was ignored
 *    — the card went on "waiting for you to finish in your browser" with no
 *    browser tab in sight. The caller claims a tab INSIDE the click
 *    (`reserveBrowserTab`) and this navigates it; a refused open is a
 *    RESULT (`opened: false`) the card turns into an explicit open button.
 *  - a hosted agent whose pod was asleep answered the mint with the waking
 *    refusal; the SDK's send path walks a delay ladder on exactly that
 *    refusal, so the mint does too.
 *  - any other mint failure was reported but shown as nothing; the caller
 *    now renders its own retry line from the rejection.
 *
 * Pure so `node --test` covers it (app/tests/custom-oauth-start.test.ts).
 */
export interface StartCustomOAuthDeps {
  mint: () => Promise<{ authorizeUrl: string }>;
  /** The shell's opener: resolves false when the browser refused the open. */
  open: (url: string) => Promise<boolean>;
  /** A tab claimed inside the click (web), or null (desktop / no gesture). */
  tab: ReservedTab | null;
  isWaking: (err: unknown) => boolean;
  sleep: (ms: number) => Promise<void>;
}

export interface StartCustomOAuthOutcome {
  authorizeUrl: string;
  /** False when the browser refused the open: the URL is still valid, and a
   *  fresh click (inside a user gesture) can open it. */
  opened: boolean;
}

/** Pauses before the second, third and fourth mint on a waking refusal. */
export const SIGN_IN_WAKING_RETRY_MS: readonly number[] = [
  3_000, 6_000, 12_000,
];

export async function startCustomOAuth(
  deps: StartCustomOAuthDeps,
): Promise<StartCustomOAuthOutcome> {
  let authorizeUrl: string;
  try {
    ({ authorizeUrl } = await retryWhileWaking(
      deps.mint,
      SIGN_IN_WAKING_RETRY_MS,
      { isWaking: deps.isWaking, sleep: deps.sleep },
    ));
  } catch (err) {
    // An empty tab whose link never came must not linger.
    deps.tab?.discard();
    throw err;
  }
  if (deps.tab?.navigate(authorizeUrl)) return { authorizeUrl, opened: true };
  return { authorizeUrl, opened: await deps.open(authorizeUrl) };
}
