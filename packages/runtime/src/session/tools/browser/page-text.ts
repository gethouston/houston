import type { Page } from "playwright-core";
import { redactUrl } from "./redact-url";
import { capText } from "./snapshot";
import { untrusted } from "./untrusted";

export const TEXT_MAX_CHARS = 20_000;

export async function pageText(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    const main = document.querySelector("main, [role=main], article");
    const root = main instanceof HTMLElement ? main : document.body;
    return root?.innerText ?? "";
  });
  const title = await page.title();
  const { kept, omitted } = capText(collapse(raw), TEXT_MAX_CHARS);
  const body = untrusted(
    `Page: ${title}\nAddress: ${redactUrl(page.url())}\n\n${kept}`,
  );
  return omitted > 0
    ? `${body}\n[... text cut off: ${omitted} more characters not shown. Take a snapshot with query to find something specific.]`
    : body;
}

export function collapse(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}
