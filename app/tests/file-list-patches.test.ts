import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FileEntry } from "@houston-ai/agent";
import { QueryClient } from "@tanstack/react-query";
import {
  newFolderEdit,
  relocateFileEntry,
  relocationEdit,
  removalEdit,
  renamedPath,
  replaceFileEntry,
  replacementEdit,
  withFolderEntry,
  withoutFileEntries,
} from "../src/lib/file-list-patches.ts";
import { classifyFileWriteRefusal } from "../src/lib/file-write-refusal.ts";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";

const file = (path: string): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  extension: path.split(".").pop() ?? "",
  size: 1,
  is_directory: false,
});
const folder = (path: string): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  extension: "",
  size: 0,
  is_directory: true,
});
const paths = (files: FileEntry[] | undefined) => files?.map((f) => f.path);

const listing = (): FileEntry[] => [
  folder("docs"),
  file("docs/a.md"),
  folder("docs/old"),
  file("docs/old/b.pdf"),
  file("notes.txt"),
];

describe("withoutFileEntries", () => {
  it("drops a folder with everything beneath it, never a name-prefix sibling", () => {
    const files = [...listing(), file("docs-archive.zip")];
    assert.deepEqual(paths(withoutFileEntries(files, ["docs"])), [
      "notes.txt",
      "docs-archive.zip",
    ]);
  });

  it("is idempotent and keeps the same array when nothing goes", () => {
    const once = withoutFileEntries(listing(), ["notes.txt"]);
    assert.equal(withoutFileEntries(once, ["notes.txt"]), once);
    assert.equal(withoutFileEntries(undefined, ["notes.txt"]), undefined);
  });
});

describe("relocateFileEntry", () => {
  it("renames a file and recomputes its name and extension", () => {
    const next = relocateFileEntry(listing(), "notes.txt", "plan.md");
    const moved = next?.find((f) => f.path === "plan.md");
    assert.equal(moved?.name, "plan.md");
    assert.equal(moved?.extension, "md");
    assert.equal(
      next?.some((f) => f.path === "notes.txt"),
      false,
    );
  });

  it("carries a folder's descendants to the new place", () => {
    const next = relocateFileEntry(listing(), "docs/old", "archive");
    assert.deepEqual(
      paths(next),
      ["docs", "docs/a.md", "archive", "archive/b.pdf"].concat("notes.txt"),
    );
    assert.equal(next?.find((f) => f.path === "archive")?.extension, "");
  });

  it("treats a leading dot as a name, like the host", () => {
    const next = relocateFileEntry(listing(), "notes.txt", ".env");
    assert.equal(next?.find((f) => f.path === ".env")?.extension, "");
  });

  it("leaves a listing that already reflects the move untouched", () => {
    const once = relocateFileEntry(listing(), "notes.txt", "docs/notes.txt");
    assert.equal(relocateFileEntry(once, "notes.txt", "docs/notes.txt"), once);
    assert.equal(relocateFileEntry(undefined, "a", "b"), undefined);
  });
});

describe("replaceFileEntry", () => {
  it("drops the occupant and puts the moved entry in its place", () => {
    const files = [...listing(), file("docs/notes.txt")];
    const next = replaceFileEntry(files, "notes.txt", "docs/notes.txt");
    assert.deepEqual(
      next?.filter((f) => f.path.endsWith("notes.txt")).map((f) => f.path),
      ["docs/notes.txt"],
    );
  });

  it("never drops the moved entry once the move has landed", () => {
    const landed = relocateFileEntry(listing(), "notes.txt", "docs/notes.txt");
    assert.equal(
      replaceFileEntry(landed, "notes.txt", "docs/notes.txt"),
      landed,
    );
  });
});

describe("withFolderEntry", () => {
  it("adds an empty folder once", () => {
    const next = withFolderEntry(listing(), "docs/new", 7);
    const added = next?.find((f) => f.path === "docs/new");
    assert.equal(added?.is_directory, true);
    assert.equal(added?.name, "new");
    assert.equal(withFolderEntry(next, "docs/new", 8), next);
    assert.equal(withFolderEntry(undefined, "x", 1), undefined);
  });
});

it("renamedPath keeps the folder and swaps the name", () => {
  assert.equal(renamedPath("docs/old/b.pdf", "c.pdf"), "docs/old/c.pdf");
  assert.equal(renamedPath("notes.txt", "plan.md"), "plan.md");
});

describe("classifyFileWriteRefusal", () => {
  it("gives each refusal exactly one surface", () => {
    const warming = new Error("almost ready");
    warming.name = "AgentWarmingError";
    assert.equal(classifyFileWriteRefusal(warming), "warming");
    assert.equal(
      classifyFileWriteRefusal({ status: 409, body: { code: "name_taken" } }),
      "name_taken",
    );
    assert.equal(
      classifyFileWriteRefusal({ status: 403, body: { code: "read_only" } }),
      "read_only",
    );
    assert.equal(classifyFileWriteRefusal(new Error("boom")), "failed");
  });
});

describe("a file delete through the optimistic engine", () => {
  const key = ["files", "/agents/a"] as const;

  it("removes the row before the host answers and restores it on refusal", async () => {
    const qc = new QueryClient();
    qc.setQueryData(key, listing());
    let refuse!: (err: Error) => void;
    const told: unknown[] = [];
    const done = runOptimisticWrite(
      {
        qc,
        command: "delete_file",
        patches: [
          {
            queryKey: key,
            apply: (files: FileEntry[] | undefined) =>
              withoutFileEntries(files, ["docs"]),
          },
        ],
        write: () =>
          new Promise<void>((_, reject) => {
            refuse = reject;
          }),
        failure: { title: "", description: "" },
      },
      (_command, err) => told.push(err),
    );
    assert.deepEqual(paths(qc.getQueryData(key)), ["notes.txt"]);
    const err = { status: 409, body: { code: "name_taken" } };
    refuse(err as unknown as Error);
    await done;
    assert.deepEqual(paths(qc.getQueryData(key)), paths(listing()));
    assert.deepEqual(told, [err]);
  });
});

describe("a refused listing edit undoes only its own entries", () => {
  const landed = file("fresh.csv");

  it("puts deleted entries back where they were, keeping new arrivals", () => {
    const edit = removalEdit(["docs"]);
    const before = listing();
    const now = [...(edit.apply(before) ?? []), landed];
    const back = edit.revert(now, before);
    assert.deepEqual(paths(back), [...(paths(listing()) ?? []), "fresh.csv"]);
    assert.deepEqual(paths(edit.revert(back, before)), paths(back));
    assert.equal(edit.revert(undefined, before), undefined);
  });

  it("moves a renamed folder back with its contents", () => {
    const edit = relocationEdit("docs", "papers");
    const before = listing();
    const back = edit.revert([...(edit.apply(before) ?? []), landed], before);
    assert.deepEqual(paths(back), [...(paths(listing()) ?? []), "fresh.csv"]);
  });

  it("restores the occupant a refused replace dropped", () => {
    const before = [file("a.md"), folder("dest"), file("dest/a.md")];
    const edit = replacementEdit("a.md", "dest/a.md");
    const back = edit.revert(edit.apply(before), before);
    assert.deepEqual(paths(back)?.sort(), ["a.md", "dest", "dest/a.md"]);
    assert.equal(
      back?.find((f) => f.path === "dest/a.md"),
      before[2],
    );
  });

  it("drops a refused new folder only", () => {
    const edit = newFolderEdit("drafts", 1);
    const before = listing();
    const now = [...(edit.apply(before) ?? []), landed];
    assert.deepEqual(paths(edit.revert(now, before)), [
      ...(paths(listing()) ?? []),
      "fresh.csv",
    ]);
  });
});
