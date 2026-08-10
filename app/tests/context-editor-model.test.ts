import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  compactMinHeight,
  isDirty,
  isWysiwygSafe,
  shouldReseed,
} from "../src/components/context/context-editor-model.ts";

describe("context editor dirty model", () => {
  it("marks any byte difference dirty (the caller compares serializations)", () => {
    strictEqual(isDirty("# Hello", "# Hello"), false);
    strictEqual(isDirty("# Hello\n", "# Hello"), true);
    strictEqual(isDirty("- one", "* one"), true);
  });

  it("reseeds only while unfocused and clean", () => {
    strictEqual(shouldReseed({ focused: false, dirty: false }), true);
    strictEqual(shouldReseed({ focused: true, dirty: false }), false);
    strictEqual(shouldReseed({ focused: false, dirty: true }), false);
    strictEqual(shouldReseed({ focused: true, dirty: true }), false);
  });
});

describe("isWysiwygSafe — the corruption guard", () => {
  it("accepts everything the schema can hold", () => {
    strictEqual(
      isWysiwygSafe(
        "# Title\n\nSome **bold** and *italic* text.\n\n- a list\n1. numbered\n\n> a quote\n\n---\n\n`code` and\n\n```\na fence\n```\n",
      ),
      true,
    );
    strictEqual(isWysiwygSafe(""), true);
  });

  it("refuses tables — they round-trip as mashed cell text", () => {
    strictEqual(
      isWysiwygSafe("| Don't say | Say |\n|---|---|\n| a | b |"),
      false,
    );
  });

  it("refuses frontmatter at the document start, but not a mid-doc rule", () => {
    strictEqual(isWysiwygSafe("---\ntitle: Hello\n---\nBody"), false);
    strictEqual(isWysiwygSafe("Above\n\n---\n\nBelow"), true);
  });

  it("refuses raw HTML, task lists, images, and reference links", () => {
    strictEqual(isWysiwygSafe("Hi <details>Secret</details>"), false);
    strictEqual(isWysiwygSafe("- [ ] todo\n- [x] done"), false);
    strictEqual(isWysiwygSafe("![alt](img.png)"), false);
    strictEqual(isWysiwygSafe("See [docs]\n\n[docs]: https://x.test"), false);
  });
});

describe("compactMinHeight", () => {
  it("floors at N real text lines plus the document's own padding", () => {
    // 16px body at leading-relaxed = 1.625rem per line; py-4 = 2rem.
    strictEqual(compactMinHeight(6), "calc(9.75rem + 2rem)");
    strictEqual(compactMinHeight(12), "calc(19.5rem + 2rem)");
  });
});
