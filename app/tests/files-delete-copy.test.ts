import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FileEntry } from "@houston-ai/agent";
import type { TFunction } from "i18next";
import {
  type DeleteTarget,
  deleteCopy,
  targetFiles,
} from "../src/components/tabs/files-delete-copy.ts";

/**
 * A stub `t` that echoes the key and whatever it was interpolated with, so the
 * assertions read as "which key, with which variables" rather than as English.
 * Real translations are the locale files' job (pnpm check-locales).
 */
const t = ((key: string, vars?: Record<string, unknown>) =>
  vars
    ? `${key}(${JSON.stringify(vars)})`
    : key) as unknown as TFunction<"agents">;

const file = (name: string, isDirectory = false): FileEntry => ({
  path: `some/${name}`,
  name,
  extension: name.includes(".") ? (name.split(".").pop() ?? "") : "",
  size: 10,
  is_directory: isDirectory,
});

describe("files delete confirmation copy", () => {
  it("names a single file and warns with the FILE description", () => {
    const copy = deleteCopy({ kind: "single", file: file("Q3.pdf") }, t);
    strictEqual(copy.title, 'files.delete.title({"name":"Q3.pdf"})');
    strictEqual(copy.description, "files.delete.fileDescription");
  });

  it("warns that a FOLDER takes everything inside it", () => {
    const copy = deleteCopy({ kind: "single", file: file("Docs", true) }, t);
    strictEqual(copy.title, 'files.delete.title({"name":"Docs"})');
    strictEqual(copy.description, "files.delete.folderDescription");
  });

  it("counts a batch instead of naming it: no name is truthful for many", () => {
    const target: DeleteTarget = {
      kind: "batch",
      files: [file("a.png"), file("b.png"), file("c.png")],
    };
    const copy = deleteCopy(target, t);
    strictEqual(copy.title, 'files.delete.batchTitle({"count":3})');
    strictEqual(copy.description, 'files.delete.batchDescription({"count":3})');
  });

  it("passes count 1 through the plural API so _one can differ per language", () => {
    const copy = deleteCopy({ kind: "batch", files: [file("a.png")] }, t);
    strictEqual(copy.title, 'files.delete.batchTitle({"count":1})');
  });

  it("renders empty, never crashes, before anything has been requested", () => {
    const copy = deleteCopy(null, t);
    strictEqual(copy.title, 'files.delete.title({"name":""})');
    strictEqual(copy.description, "files.delete.fileDescription");
  });

  it("resolves either target shape to a plain list for the caller", () => {
    const one = file("Q3.pdf");
    deepStrictEqual(targetFiles({ kind: "single", file: one }), [one]);
    const many = [file("a.png"), file("b.png")];
    deepStrictEqual(targetFiles({ kind: "batch", files: many }), many);
  });
});
