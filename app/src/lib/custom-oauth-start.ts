import type { ReservedTab } from "./browser-tab.ts";
import { retryWhileWaking } from "./waking-retry.ts";

export interface StartCustomOAuthDeps {
  mint: () => Promise<{ authorizeUrl: string }>;
  open: (url: string) => Promise<boolean>;
  tab: ReservedTab | null;
  isWaking: (err: unknown) => boolean;
  sleep: (ms: number) => Promise<void>;
}

export interface StartCustomOAuthOutcome {
  authorizeUrl: string;
  opened: boolean;
}

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
    deps.tab?.discard();
    throw err;
  }
  if (await deps.tab?.navigate(authorizeUrl))
    return { authorizeUrl, opened: true };
  return { authorizeUrl, opened: await deps.open(authorizeUrl) };
}
