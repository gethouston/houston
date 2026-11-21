import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../src/components/${path}`, import.meta.url), "utf8");

const PILL =
  "flex shrink-0 items-center justify-center gap-1.5 h-11 min-w-11 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-[color,background-color,scale] active:scale-[0.96] outline-none md:h-7 md:min-w-0 md:shrink md:active:scale-100";

describe("the composer toolbar on a phone", () => {
  it("draws mode, model and effort as 44px targets, 28px from md", () => {
    for (const file of [
      "chat-mode-selector.tsx",
      "chat-model-selector.tsx",
      "chat-effort-selector.tsx",
    ]) {
      ok(read(file).includes(PILL), `${file}: not the phone pill`);
    }
  });

  it("draws the context ring as a 44px target, 28px from md", () => {
    const src = read("context-indicator.tsx");
    ok(src.includes("size-11"));
    ok(src.includes("md:size-7"));
    ok(src.includes("transition-[color,background-color,scale]"));
    ok(
      src.includes("active:scale-[0.96]") &&
        src.includes("md:active:scale-100"),
    );
  });

  it("scrolls the pickers on a phone and pins the context ring", () => {
    const src = read("use-agent-chat-panel.tsx");
    ok(
      src.includes(
        'className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-0.5 [scrollbar-width:none] md:gap-2 md:overflow-visible md:p-0"',
      ),
      "the pickers scroll, padded for their focus rings",
    );
    const pickers = src.indexOf('data-testid="composer-toolbar-pickers"');
    const ring = src.indexOf("<ContextIndicator", pickers);
    const pickersEnd = src.lastIndexOf("</div>", ring);
    ok(pickers > 0 && ring > pickersEnd, "the ring sits outside the scroller");
  });
});
