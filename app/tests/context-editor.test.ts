import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * The node runner has no DOM, so the ONE standing-context editor's wiring is
 * guarded on its source (the repo's React-test idiom). Each assertion stands
 * for a review finding that shipped once in the consolidated grammar.
 */
describe("context-editor source", () => {
  const box = read("../src/components/context/context-editor.tsx");
  const hook = read("../src/components/context/use-context-editor-save.ts");
  const editor = read("../src/components/context/markdown-editor.tsx");
  const toolbar = read("../src/components/context/markdown-toolbar.tsx");

  it("recovers from a failed save instead of sticking on Saving…", () => {
    // The data layer owns the toast; the queue must still catch so the
    // promise is never an unhandled rejection and the state returns to idle.
    ok(
      /\.catch\(\(\) => \{[\s\S]*?setState\("idle"\)/.test(hook),
      "a rejection resets the save state",
    );
  });

  it("routes every write through one ordered queue", () => {
    ok(hook.includes("chainRef.current = chainRef.current"), "saves chain");
    ok(
      hook.includes("if (lastQueuedRef.current === next) return;"),
      "the same text is never submitted twice back-to-back",
    );
  });

  it("guards background reseeds, holds mid-edit updates, flushes on unmount", () => {
    ok(hook.includes("shouldReseed({"), "prop updates use the reseed guard");
    ok(
      hook.includes("pendingExternalRef.current = content;"),
      "an update that lands mid-edit is held, not dropped",
    );
    ok(
      /\.then\(\(\) => onSaveRef\.current\(valueRef\.current\)\)\s*\.catch/.test(
        hook,
      ),
      "cleanup flushes pending content through the queue",
    );
  });

  it("refuses to rich-edit markdown the schema would corrupt", () => {
    ok(
      hook.includes("isWysiwygSafe"),
      "the corruption guard decides the editing mode",
    );
    ok(
      editor.includes("function PlainEditor"),
      "unsafe documents get the byte-preserving plain face",
    );
  });

  it("derives the box's accessible name from the page title", () => {
    ok(
      box.includes(
        '<ContextEditorBox layout="fill" ariaLabel={title} {...box} />',
      ),
      "ContextEditorPage names the editor after its hero",
    );
  });

  it("uses MarkdownEditor inside the standing prose box", () => {
    ok(
      box.includes("<MarkdownEditor"),
      "ContextEditorBox delegates its document field to MarkdownEditor",
    );
  });

  it("reads TipTap callbacks through the latest-ref, never a stale closure", () => {
    // TipTap binds handlers once at construction and @tiptap/react never
    // re-registers them, so every handler must dereference the ref.
    ok(editor.includes("function useCallbacksRef"), "the latest-ref exists");
    ok(
      !/on(Create|Update|Focus|Blur): \(\) => on[A-Z]/.test(editor),
      "no handler closes over raw props",
    );
  });

  it("carries no design-token violations in the editor or its toolbar", () => {
    for (const src of [editor, toolbar, box]) {
      ok(!src.includes("rgba("), "no raw shadow literal");
      ok(!/#(?:[\da-fA-F]{3}){1,2}\b/.test(src), "no raw hex literal");
      ok(!src.includes("text-[11px]"), "no off-scale label size");
    }
    ok(
      editor.includes("focus-visible]:ring-focus"),
      "focus is the shared ring",
    );
    ok(
      toolbar.includes("hover:bg-chip hover:text-ink"),
      "the pressed fill survives its own hover",
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
