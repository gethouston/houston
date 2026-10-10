import { linkedInShareUrl } from "./org-chart-share-model.ts";

/**
 * The share actions' sequencing, with the browser handed in so the order is
 * testable. DOM-free.
 */

/**
 * A clipboard the browser refused: no clipboard at all (plain-HTTP
 * self-host), or a write it did not allow (no focus, no permission). The
 * person's setup, not a bug: nothing to report.
 */
export function isExpectedClipboardRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

export interface LinkedInShareDeps {
  /** `navigator.clipboard?.writeText`, absent where there is no clipboard. */
  writeText: ((text: string) => Promise<void>) | undefined;
  /** Open in the browser; `false` when it did not take the URL. */
  open: (url: string) => Promise<boolean>;
  report: (command: string, error: unknown) => void;
}

export interface LinkedInShareResult {
  url: string;
  opened: boolean;
  copied: boolean;
}

/**
 * Copy the post and open LinkedIn's composer with it.
 *
 * Both start in the click's own tick, with no `await` before the open:
 * Safari and Firefox only let a page open a tab while the click is still
 * being handled, and after an async hop `window.open` is popup-blocked. The
 * copy starts first because opening a tab takes focus from the page, and a
 * clipboard write without focus is refused.
 */
export async function shareToLinkedIn(
  post: string,
  deps: LinkedInShareDeps,
): Promise<LinkedInShareResult> {
  const url = linkedInShareUrl(post);
  const copying: Promise<boolean> = deps.writeText
    ? deps.writeText(post).then(
        () => true,
        (error: unknown) => {
          if (!isExpectedClipboardRefusal(error))
            deps.report("org_chart_share_copy_text", error);
          return false;
        },
      )
    : Promise.resolve(false);
  const opening = deps.open(url);
  const [opened, copied] = await Promise.all([opening, copying]);
  return { url, opened, copied };
}
