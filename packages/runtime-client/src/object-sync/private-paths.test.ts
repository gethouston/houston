import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeAtomically } from "./http-store-batch";
import { downloadFile } from "./http-store-download";
import { hydrate } from "./hydrate";
import { LocalDirStore } from "./object-store";
import { privateDirOf } from "./private-paths";

const PREFIX = "ws/w1/agent-1";
const STATE = "workspaces/P/Bob/.houston/browser/state.json";
const posixOnly = process.platform === "win32" ? describe.skip : describe;
const modeOf = (path: string) => statSync(path).mode & 0o777;

test("only paths under a .houston/browser directory are private", () => {
  expect(privateDirOf("/t/store/ws/Bob/.houston/browser/state.json")).toBe(
    "/t/store/ws/Bob/.houston/browser",
  );
  expect(privateDirOf("C:\\t\\Bob\\.houston\\browser\\state.json")).toBe(
    "C:\\t\\Bob\\.houston\\browser",
  );
  expect(privateDirOf("/t/Bob/.houston/browser")).toBeUndefined();
  expect(
    privateDirOf("/t/Bob/.houston/routines/routines.json"),
  ).toBeUndefined();
  expect(privateDirOf("/t/Bob/browser/state.json")).toBeUndefined();
});

test("a relative root and a case-folding filesystem's spellings are private too", () => {
  expect(privateDirOf(".houston/browser/state.json")).toBe(".houston/browser");
  expect(privateDirOf(".houston\\browser\\state.json")).toBe(
    ".houston\\browser",
  );
  expect(privateDirOf("Bob/.Houston/Browser/state.json")).toBe(
    "Bob/.Houston/Browser",
  );
  expect(privateDirOf("C:\\Bob\\.HOUSTON\\BROWSER\\State.json")).toBe(
    "C:\\Bob\\.HOUSTON\\BROWSER",
  );
  expect(privateDirOf("x.houston/browser/state.json")).toBeUndefined();
  expect(privateDirOf(".houston/browsers/state.json")).toBeUndefined();
});

posixOnly("under a tool shell's umask 002", () => {
  let previous: number;
  beforeEach(() => {
    previous = process.umask(0o002);
  });
  afterEach(() => {
    process.umask(previous);
  });

  test("hydrate lands sign-in state owner-only, the rest group-shared", async () => {
    const storeRoot = mkdtempSync(join(tmpdir(), "houston-store-"));
    const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
    for (const rel of [STATE, "workspaces/P/Bob/notes.txt"]) {
      const abs = join(storeRoot, PREFIX, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, "{}");
    }
    await hydrate(new LocalDirStore(storeRoot), PREFIX, work);
    const state = join(work, STATE);
    expect(readFileSync(state, "utf8")).toBe("{}");
    expect(modeOf(state)).toBe(0o600);
    expect(modeOf(join(state, ".."))).toBe(0o700);
    expect(modeOf(join(work, "workspaces/P/Bob/notes.txt"))).toBe(0o664);
  });

  test("an HTTP store download lands sign-in state owner-only", async () => {
    const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
    const dest = join(work, STATE);
    await downloadFile(new Response("{}"), STATE, dest);
    expect(modeOf(dest)).toBe(0o600);
    expect(modeOf(join(dest, ".."))).toBe(0o700);
  });

  test("a batched or prefetched read lands sign-in state owner-only", async () => {
    const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
    const dest = join(work, STATE);
    mkdirSync(join(dest, ".."), { recursive: true, mode: 0o775 });
    await writeAtomically(dest, Buffer.from("{}"));
    expect(modeOf(dest)).toBe(0o600);
    expect(modeOf(join(dest, ".."))).toBe(0o700);
  });

  test("a local store download over an open file closes it", async () => {
    const storeRoot = mkdtempSync(join(tmpdir(), "houston-store-"));
    const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
    mkdirSync(join(storeRoot, STATE, ".."), { recursive: true });
    writeFileSync(join(storeRoot, STATE), "{}");
    const dest = join(work, STATE);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, "old", { mode: 0o664 });
    await new LocalDirStore(storeRoot).download(STATE, dest);
    expect(modeOf(dest)).toBe(0o600);
  });
});
