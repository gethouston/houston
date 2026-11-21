import type { Page } from "playwright-core";
import { labeledScreenshot } from "./labels";
import type { BrowserTab } from "./open-tab";
import { redactUrl } from "./redact-url";
import type { ActionOutcome } from "./run-action";
import { untrusted } from "./untrusted";

const jpeg = (page: Page) => page.screenshot({ type: "jpeg", quality: 60 });

export async function screenshot(
  tab: BrowserTab,
  labeled: boolean,
): Promise<ActionOutcome> {
  const address = `Address: ${redactUrl(tab.page.url())}`;
  if (!labeled) return picture(await jpeg(tab.page), untrusted(address));
  const { image, labels } = await labeledScreenshot(tab, jpeg);
  const list = labels.map((l) => `${l.ref} ${l.role} "${l.name}"`).join("\n");
  return picture(
    image,
    `${labels.length} controls are labeled with their refs; click takes them as printed.\n${untrusted(`${address}\n\n${list}`)}`,
  );
}

function picture(image: Buffer, caption: string): ActionOutcome {
  return {
    content: [
      { type: "text", text: `Screenshot of the page.\n${caption}` },
      { type: "image", data: image.toString("base64"), mimeType: "image/jpeg" },
    ],
    mutated: false,
  };
}
