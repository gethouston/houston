import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("context-editor source", () => {
  const box = read("../src/components/context/context-editor.tsx");
  const hook = read("../src/components/context/use-context-editor-save.ts");
  const editor = read("../src/components/context/markdown-editor.tsx");
  const toolbar = read("../src/components/context/markdown-toolbar.tsx");

  it("recovers from a failed save instead of sticking on Saving…", () => {
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

  it("uses MarkdownEditor inside the standing prose box", () => {
    ok(
      box.includes("<MarkdownEditor"),
      "ContextEditorBox delegates its document field to MarkdownEditor",
    );
  });

  it("reads TipTap callbacks through the latest-ref, never a stale closure", () => {
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
