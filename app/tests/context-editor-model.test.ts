import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isDirty,
  shouldReseed,
} from "../src/components/context/context-editor-model.ts";

describe("context editor dirty model", () => {
  it("is clean only when serialized content matches its serialized baseline", () => {
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
