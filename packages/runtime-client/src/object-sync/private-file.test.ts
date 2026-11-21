import { execFileSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readPrivateFile } from "./private-file";

const posixOnly = process.platform === "win32" ? describe.skip : describe;
const uid = process.getuid?.();

function stateFile(body = '{"cookies":[]}') {
  const root = mkdtempSync(join(tmpdir(), "private-file-"));
  const dir = join(root, ".houston", "browser");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "state.json");
  writeFileSync(file, body);
  return { root, dir, file };
}

posixOnly("reading one sign-in file through a checked descriptor", () => {
  test("a regular file this process owns is read", async () => {
    const { file } = stateFile('{"cookies":["mine"]}');
    const read = await readPrivateFile(file);
    expect(read.kind).toBe("read");
    if (read.kind === "read")
      expect(read.body.toString()).toBe('{"cookies":["mine"]}');
  });

  test("a file another uid owns is refused", async () => {
    const { file } = stateFile();
    expect(await readPrivateFile(file, (uid ?? 0) + 1)).toEqual({
      kind: "refused",
      problem: expect.stringMatching(/^is owned by uid \d+, not this process/),
    });
  });

  test("a hard link to a file this process owns is refused", async () => {
    const { root, file } = stateFile('{"cookies":["planted"],"origins":[]}');
    linkSync(file, join(root, "elsewhere.json"));
    expect(await readPrivateFile(file)).toEqual({
      kind: "refused",
      problem: "has 2 hard links",
    });
  });

  test("a symlinked file is never read through", async () => {
    const { dir, file } = stateFile();
    const secret = join(mkdtempSync(join(tmpdir(), "secret-")), "secret");
    writeFileSync(secret, "not sign-in state");
    renameSync(file, join(dir, "old.json"));
    symlinkSync(secret, file);
    expect(await readPrivateFile(file)).toEqual({
      kind: "refused",
      problem: "is a symlink",
    });
  });

  test("a FIFO is refused without blocking on a writer", async () => {
    const { dir } = stateFile();
    const fifo = join(dir, "pipe.json");
    execFileSync("mkfifo", [fifo]);
    expect(await readPrivateFile(fifo)).toEqual({
      kind: "refused",
      problem: "is not a regular file",
    });
  });

  test("a directory swapped for a file is refused, not missing", async () => {
    const { root, dir, file } = stateFile();
    renameSync(dir, join(root, "moved"));
    writeFileSync(dir, "planted");
    expect((await readPrivateFile(file)).kind).toBe("refused");
  });

  test("no file is simply missing", async () => {
    const { dir } = stateFile();
    expect(await readPrivateFile(join(dir, "absent.json"))).toEqual({
      kind: "missing",
    });
  });
});
