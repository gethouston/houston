import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAdr } from "../adr-refs.ts";
import { workingTreeFiles, workingTreeRepo } from "../adr-repo.ts";

let root = "";
const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const git = (...args: string[]): void => {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "adr-repo-"));
  git("init", "-q");
  write(".gitignore", "dist/\n");
  write("src/kept.ts", "export const kept = 1;");
  write("src/deleted.ts", "export const gone = 1;");
  write("src/dir/one.ts", "export const one = 'refresh_token_invalidated';");
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-qm",
    "init",
  );
  rmSync(join(root, "src/deleted.ts"));
  rmSync(join(root, "src/dir/one.ts"));
  write("src/dir/two.ts", "export const two = 2;");
  write("src/fresh.ts", "export const fresh = 'NEW_FLAG';");
  write("dist/built.ts", "export const built = 1;");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("working tree repo view", () => {
  it("lists tracked and untracked files that exist, never ignored or deleted ones", () => {
    expect(workingTreeFiles(root).sort()).toEqual([
      ".gitignore",
      "src/dir/two.ts",
      "src/fresh.ts",
      "src/kept.ts",
    ]);
  });

  it("passes an untracked file and reports a deleted one as missing", () => {
    const repo = workingTreeRepo(root, new Set());
    const problems = checkAdr(
      [
        "Lives in `src/fresh.ts` and `src/kept.ts`.",
        "Reads `src/deleted.ts`.",
        "Covers `src/dir/` (`two`).",
      ].join("\n"),
      repo,
    );
    expect(problems).toEqual([
      { line: 2, message: "names src/deleted.ts, which does not exist" },
    ]);
  });

  it("finds words in the code of the working tree only", () => {
    const repo = workingTreeRepo(root, new Set());
    expect(repo.inCode("NEW_FLAG")).toBe(true);
    expect(repo.inCode("refresh_token_invalidated")).toBe(false);
    expect(repo.inCode("built")).toBe(false);
  });
});
