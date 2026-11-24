import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot, scopedFiles } from "../files.ts";

const root = mkdtempSync(join(tmpdir(), "comments-scope-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("file scope", () => {
  it("reads tracked and untracked files, never ignored or excluded ones", () => {
    const write = (file: string) => {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "export const a = 1;\n");
    };
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    write(".gitignore");
    writeFileSync(join(root, ".gitignore"), "ignored/\n");
    write("src/tracked.ts");
    write("src/notes.md");
    write("vendor/lib.ts");
    git("add", ".");
    write("src/untracked.ts");
    write("ignored/skip.ts");
    const config = {
      excludedDirNames: ["vendor"],
      excluded: [],
      pinned: [],
      retiredPaths: [],
    };
    expect(scopedFiles(config, [], root)).toEqual([
      "src/tracked.ts",
      "src/untracked.ts",
    ]);
  });
});

describe("comments:ratchet --init", () => {
  it("refuses to overwrite an existing baseline without --force", () => {
    const run = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "scripts/comments/cli-ratchet.ts",
        "--init",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/baseline\.json already exists/);
  });
});
