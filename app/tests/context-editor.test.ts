import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * The node runner has no DOM, so the ONE standing-context editor's wiring is
 * guarded on its source (the repo's React-test idiom). Each assertion stands
 * for a review finding that shipped once in the consolidated grammar: a save
 * failure that stuck the UI on "Saving…", editors with no accessible name,
 * and design-token violations carried over from the deleted editor.
 */
describe("context-editor source", () => {
  const src = read("../src/components/context/context-editor.tsx");

  it("recovers from a failed save instead of sticking on Saving…", () => {
    // The data layer owns the toast; the box must still catch so the promise
    // is never an unhandled rejection and the state returns to idle.
    ok(src.includes("try {"), "save path is guarded");
    ok(
      /catch\s*\{[\s\S]*?setState\("idle"\)/.test(src),
      "a rejection resets the save state",
    );
  });

  it("derives the box's accessible name from the page title", () => {
    ok(
      src.includes("<ContextEditorBox ariaLabel={title} {...box} />"),
      "ContextEditorPage names the editor after its hero",
    );
  });

  it("uses MarkdownEditor inside the standing prose box", () => {
    ok(
      src.includes("<MarkdownEditor"),
      "ContextEditorBox delegates its document field to MarkdownEditor",
    );
  });

  it("guards background reseeds and flushes dirty content on unmount", () => {
    ok(src.includes("shouldReseed({"), "prop updates use the reseed guard");
    ok(
      src.includes("onSaveRef.current(valueRef.current).catch(() => {})"),
      "cleanup flushes pending content and contains its rejected promise",
    );
  });

  it("carries no design-token violations from the deleted editor", () => {
    // DESIGN.md: no raw rgba/px shadow literals, no off-scale type sizes, and
    // focus is the ring-focus idiom (which the strip's lozenges use too).
    ok(!src.includes("rgba("), "no raw shadow literal");
    ok(!src.includes("text-[11px]"), "no off-scale label size");
    const markdown = read("../src/components/context/markdown-editor.tsx");
    ok(!markdown.includes("rgba("), "no raw rgba literal");
    ok(!/#(?:[\da-fA-F]{3}){1,2}\b/.test(markdown), "no raw hex literal");
    ok(
      markdown.includes("focus-visible]:ring-focus"),
      "focus is the shared ring",
    );
  });
});

describe("the Analytics lens is view state, not a module singleton", () => {
  it("threads lens/lenses as props from the view that owns the section", () => {
    const view = read("../src/components/organization/organization-view.tsx");
    ok(view.includes("useState<AnalyticsLens>"), "the view owns the lens");
    ok(
      view.includes("resolveAnalyticsLens(lens, lenses)"),
      "the view resolves the visible lens once for header AND body",
    );
    const header = read(
      "../src/components/organization/admin-analytics-header.tsx",
    );
    ok(!header.includes("zustand"), "the drilled header is stateless");
    ok(
      !header.includes("useCapabilities"),
      "the lens set arrives resolved, not re-derived",
    );
  });
});
