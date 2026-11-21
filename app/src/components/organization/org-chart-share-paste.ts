import { isExpectedClipboardRefusal } from "./org-chart-share-copy.ts";
import {
  linkedInShareUrl,
  type ShareChannel,
} from "./org-chart-share-model.ts";
import type { ShareLanding } from "./org-chart-share-run.ts";

export interface PasteDeps {
  post: string;
  png: Promise<File>;
  copyImage: ((png: Promise<File>) => Promise<void>) | undefined;
  open: (url: string) => Promise<boolean>;
  save: (file: File) => Promise<boolean>;
  report: (command: string, error: unknown) => void;
  tauri: boolean;
}

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
    return null;
  }
  try {
    return (await deps.save(file)) ? "saved" : null;
  } catch (error) {
    deps.report("org_chart_share_download", error);
    return null;
  }
}
