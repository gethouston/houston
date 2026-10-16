import { isExpectedClipboardRefusal } from "./org-chart-share-copy.ts";
import {
  linkedInShareUrl,
  type ShareChannel,
} from "./org-chart-share-model.ts";
import type { ShareLanding } from "./org-chart-share-run.ts";

/**
 * Share on LinkedIn by copy and paste, where Houston cannot post for the
 * person: LinkedIn's composer opens with the post, and the picture goes on
 * the clipboard, or is saved as a file when the clipboard refuses. DOM-free:
 * the browser is handed in, so the order is testable.
 */

export interface PasteDeps {
  post: string;
  /** The share image, still drawing or drawn. Rejects when the draw failed. */
  png: Promise<File>;
  /**
   * `navigator.clipboard.write` of one PNG `ClipboardItem`, absent where the
   * browser has no image clipboard. It takes the promise, not the blob.
   */
  copyImage: ((png: Promise<File>) => Promise<void>) | undefined;
  /** Open in the browser; `false` when it did not take the URL. */
  open: (url: string) => Promise<boolean>;
  /** Save as a download; `false` when the person cancelled the save. */
  save: (file: File) => Promise<boolean>;
  report: (command: string, error: unknown) => void;
  /** The desktop shell has no popup blocker: a refusal toasted itself. */
  tauri: boolean;
}

/**
 * The clipboard write and the open both start in the click's own tick, with
 * no `await` before either: Safari only lets a page write the clipboard or
 * open a tab while the click is still being handled. The write starts first
 * because opening a tab takes focus from the page.
 */
export function shareByPaste(deps: PasteDeps): Promise<ShareLanding> {
  const url = linkedInShareUrl(deps.post);
  let copying: Promise<boolean>;
  try {
    copying = deps.copyImage
      ? deps.copyImage(deps.png).then(
          () => true,
          (error: unknown) => refused(deps, error),
        )
      : Promise.resolve(false);
  } catch (error) {
    copying = refused(deps, error);
  }
  const opening = deps.open(url);
  return Promise.all([opening, copying]).then(async ([opened, copied]) => {
    const image = copied ? "copied" : await saveInstead(deps);
    return pasteLanding(url, opened, image, deps.tauri);
  });
}

/** What the dialog says and tracks once the paste share lands. */
export function pasteLanding(
  url: string,
  opened: boolean,
  image: "copied" | "saved" | null,
  tauri: boolean,
): ShareLanding {
  const channel: ShareChannel =
    image === "copied"
      ? "linkedin"
      : image === "saved"
        ? "linkedin_download"
        : "linkedin_text_only";
  const line = image ? { kind: image } : null;
  if (opened) return { channel, line };
  if (tauri) return { channel: null, line };
  return {
    channel: null,
    line: { kind: "blocked", url, channel, ...(image ? { image } : {}) },
  };
}

/**
 * A refused write reports only when it is neither the browser's own refusal
 * nor the drawing failing (which reported when it failed).
 */
async function refused(deps: PasteDeps, error: unknown): Promise<false> {
  const drawn = await deps.png.then(
    () => true,
    () => false,
  );
  if (drawn && !isExpectedClipboardRefusal(error))
    deps.report("org_chart_share_copy_image", error);
  return false;
}

async function saveInstead(deps: PasteDeps): Promise<"saved" | null> {
  let file: File;
  try {
    file = await deps.png;
  } catch {
    // The drawing reported its own failure; LinkedIn is open without it.
    return null;
  }
  try {
    return (await deps.save(file)) ? "saved" : null;
  } catch (error) {
    deps.report("org_chart_share_download", error);
    return null;
  }
}
