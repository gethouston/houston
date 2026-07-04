import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { claudeProjectsDir } from "./paths";
import { createSessionsStore } from "./sessions-store";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function dataDir(): string {
  return mkdtempSync(join(tmpdir(), "claude-data-"));
}

/** Write a fake SDK transcript for `sessionId` under the isolated config dir. */
function writeTranscript(dir: string, sessionId: string): void {
  const projects = join(
    dir,
    "backends",
    "claude",
    "config",
    "projects",
    "proj",
  );
  mkdirSync(projects, { recursive: true });
  writeFileSync(join(projects, `${sessionId}.jsonl`), "{}");
}

test("set / get round-trips and persists across store instances", () => {
  const dir = dataDir();
  createSessionsStore(dir).setSessionId("c1", "sess-1");
  expect(createSessionsStore(dir).getSessionId("c1")).toBe("sess-1");
});

test("the sessions file is written with mode 0600", () => {
  const dir = dataDir();
  createSessionsStore(dir).setSessionId("c1", "sess-1");
  const mode = statSync(join(dir, "backends", "claude", "sessions.json")).mode;
  expect(mode & 0o777).toBe(0o600);
});

test("remove forgets a mapping", () => {
  const dir = dataDir();
  const store = createSessionsStore(dir);
  store.setSessionId("c1", "sess-1");
  store.remove("c1");
  expect(store.getSessionId("c1")).toBeUndefined();
});

test("resolveResume returns the id when its transcript exists", () => {
  const dir = dataDir();
  const store = createSessionsStore(dir);
  store.setSessionId("c1", "sess-1");
  writeTranscript(dir, "sess-1");
  expect(store.resolveResume("c1")).toBe("sess-1");
});

test("resolveResume with no mapping returns undefined", () => {
  expect(createSessionsStore(dataDir()).resolveResume("nope")).toBeUndefined();
});

test("a missing transcript warns, drops the mapping, and starts fresh", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const dir = dataDir();
  const store = createSessionsStore(dir);
  store.setSessionId("c1", "sess-gone");
  // No transcript on disk → resume is impossible.
  expect(store.resolveResume("c1")).toBeUndefined();
  expect(warn).toHaveBeenCalled();
  // The dangling mapping is dropped so we don't warn on every subsequent turn.
  expect(store.getSessionId("c1")).toBeUndefined();
});

test("purge drops the mapping AND deletes the transcript", () => {
  const dir = dataDir();
  const store = createSessionsStore(dir);
  store.setSessionId("c1", "sess-1");
  writeTranscript(dir, "sess-1");
  const transcript = join(claudeProjectsDir(dir), "proj", "sess-1.jsonl");
  expect(existsSync(transcript)).toBe(true);

  store.purge("c1");

  expect(store.getSessionId("c1")).toBeUndefined();
  expect(existsSync(transcript)).toBe(false);
});

test("purge is a no-op for a conversation that never ran on this backend", () => {
  const dir = dataDir();
  // No mapping, no transcript, no config dir at all → must not throw.
  expect(() => createSessionsStore(dir).purge("never")).not.toThrow();
});

test("a corrupt sessions.json degrades to empty rather than throwing", () => {
  const dir = dataDir();
  mkdirSync(join(dir, "backends", "claude"), { recursive: true });
  writeFileSync(join(dir, "backends", "claude", "sessions.json"), "{not json");
  expect(createSessionsStore(dir).getSessionId("c1")).toBeUndefined();
});
