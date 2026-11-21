import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileArgumentError } from "./file-staging";
import { agentFileReader, workspaceRelFor } from "./workspace-file";

const ROOT_KEY = "Personal/Asistente x";
let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-file-"));
  dir = join(root, "workspaces", "Personal", "Asistente x");
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(join(dir, "reports", "q3.pdf"), "%PDF");
  mkdirSync(join(root, "outside"));
  writeFileSync(join(root, "outside", "secret.txt"), "not the agent's");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const read = (path: string) =>
  agentFileReader({ dir, rootKey: ROOT_KEY })(path);

describe("agent file paths", () => {
  test("relative, absolute in this folder, and absolute from another root", () => {
    const files = { dir, rootKey: ROOT_KEY };
    expect(workspaceRelFor(files, "reports/q3.pdf")).toBe("reports/q3.pdf");
    expect(workspaceRelFor(files, "./a/../b.pdf")).toBe("b.pdf");
    expect(workspaceRelFor(files, `${dir}/reports/q3.pdf`)).toBe(
      "reports/q3.pdf",
    );
    expect(
      workspaceRelFor(
        files,
        `/work/houston-turn-1/store/workspaces/${ROOT_KEY}/c/d.pdf`,
      ),
    ).toBe("c/d.pdf");
  });

  test("Windows drive and UNC paths are absolute", () => {
    const files = {
      dir: "C:\\Users\\ana\\.houston\\workspaces\\Personal\\Bob",
      rootKey: "Personal/Bob",
    };
    expect(
      workspaceRelFor(
        files,
        "c:\\users\\ana\\.houston\\workspaces\\Personal\\Bob\\r\\q3.pdf",
      ),
    ).toBe("r/q3.pdf");
    for (const bad of ["D:\\other\\q3.pdf", "\\\\server\\share\\q3.pdf"]) {
      expect(() => workspaceRelFor(files, bad)).toThrow(
        /outside this agent's files/,
      );
    }
  });

  test("traversal and paths elsewhere are refused", () => {
    const files = { dir, rootKey: ROOT_KEY };
    for (const bad of ["/tmp/x.pdf", "../x.pdf", "a/../../x.pdf", ".", ""]) {
      expect(() => workspaceRelFor(files, bad)).toThrow(
        /outside this agent's files/,
      );
    }
  });
});

describe("agent file reads", () => {
  test("a regular file in the folder is read whole", async () => {
    expect(await read("reports/q3.pdf")).toEqual({
      name: "q3.pdf",
      bytes: Buffer.from("%PDF"),
    });
    expect(await read(`${dir}/reports/q3.pdf`)).not.toBeNull();
  });

  test("a missing file reads as null", async () => {
    expect(await read("reports/q4.pdf")).toBeNull();
  });

  test("a link inside the folder to a file inside it is followed", async () => {
    symlinkSync(join(dir, "reports", "q3.pdf"), join(dir, "latest.pdf"));
    expect((await read("latest.pdf"))?.bytes).toEqual(Buffer.from("%PDF"));
  });

  test("a link to a file outside the folder is refused", async () => {
    symlinkSync(join(root, "outside", "secret.txt"), join(dir, "notes.txt"));
    await expect(read("notes.txt")).rejects.toThrow(
      /outside this agent's files/,
    );
  });

  test("a link to a folder outside is refused for files beneath it", async () => {
    symlinkSync(join(root, "outside"), join(dir, "shared"));
    await expect(read("shared/secret.txt")).rejects.toThrow(
      /outside this agent's files/,
    );
  });

  test("a link to nothing is refused", async () => {
    symlinkSync(join(root, "gone.txt"), join(dir, "dangling.txt"));
    await expect(read("dangling.txt")).rejects.toBeInstanceOf(
      FileArgumentError,
    );
  });

  test("a folder is not a file", async () => {
    await expect(read("reports")).rejects.toThrow(/not a regular file/);
  });

  test("a file not on disk is read from the fallback (lazy turn trees)", async () => {
    const fromStore = agentFileReader({
      dir,
      rootKey: ROOT_KEY,
      fallback: async (rel) =>
        rel === "old/plan.pdf" ? Buffer.from("stored") : null,
    });
    expect((await fromStore("old/plan.pdf"))?.bytes).toEqual(
      Buffer.from("stored"),
    );
    expect(await fromStore("old/none.pdf")).toBeNull();
  });
});
