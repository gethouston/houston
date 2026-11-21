import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { browserStatePath, readState } from "./state-store";

const afterDirCheck = vi.hoisted(() => ({ hook: async () => {} }));

vi.mock("@houston/runtime-client/object-sync", async (original) => {
  const real =
    await original<typeof import("@houston/runtime-client/object-sync")>();
  return {
    ...real,
    privateDirProblem: async (dir: string) => {
      const problem = await real.privateDirProblem(dir);
      await afterDirCheck.hook();
      return problem;
    },
  };
});

const posixOnly = process.platform === "win32" ? describe.skip : describe;
const SAVED = { cookies: [], origins: [] };

function savedState(): string {
  const path = browserStatePath(
    mkdtempSync(join(tmpdir(), "browser-file-refusal-")),
  );
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(SAVED));
  return path;
}

afterEach(() => {
  afterDirCheck.hook = async () => {};
  vi.restoreAllMocks();
});

posixOnly("reading sign-ins checks the file it reads", () => {
  test("the worker's own file is read", async () => {
    expect(await readState(savedState())).toEqual(SAVED);
  });

  test("a file another uid owns reads as no saved state, logged once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = savedState();
    const uid = process.getuid?.() ?? 0;
    afterDirCheck.hook = async () => {
      vi.spyOn(process as { getuid: () => number }, "getuid").mockReturnValue(
        uid + 1,
      );
    };
    expect(await readState(path)).toBeUndefined();
    vi.mocked(process.getuid)?.mockRestore();
    expect(await readState(path)).toBeUndefined();
    const fileLines = error.mock.calls
      .map(([line]) => String(line))
      .filter((line) => /state\.json is owned by uid/.test(line));
    expect(fileLines).toHaveLength(1);
    expect(fileLines[0]).toMatch(/^\[browser\] not reading sign-in state: /);
  });

  test("a symlinked file is never read through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = savedState();
    const planted = join(mkdtempSync(join(tmpdir(), "planted-")), "s.json");
    writeFileSync(planted, JSON.stringify({ cookies: [{}], origins: [] }));
    renameSync(path, `${path}.old`);
    symlinkSync(planted, path);
    expect(await readState(path)).toBeUndefined();
  });

  test("a directory swapped in after the check is never read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const path = savedState();
    const planted = mkdtempSync(join(tmpdir(), "planted-"));
    const elsewhere = join(mkdtempSync(join(tmpdir(), "elsewhere-")), "s");
    writeFileSync(elsewhere, JSON.stringify({ cookies: [{}], origins: [] }));
    symlinkSync(elsewhere, join(planted, "state.json"));
    afterDirCheck.hook = async () => {
      renameSync(dirname(path), `${dirname(path)}-real`);
      symlinkSync(planted, dirname(path));
    };
    expect(await readState(path)).toBeUndefined();
  });
});
