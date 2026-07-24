import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { claudeProjectsDir } from "./paths";
import { createSessionsStore } from "./sessions-store";

// The transcript `projects` tree is SHARED (under CLAUDE_CONFIG_DIR =
// HOUSTON_HOME/claude-login), so point HOUSTON_HOME at a temp dir per test.
const savedHome = process.env.HOUSTON_HOME;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "claude-home-"));
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = savedHome;
});

/** A fresh per-agent data dir (holds only sessions.json). */
function dataDir(): string {
  return mkdtempSync(join(tmpdir(), "claude-data-"));
}

/** Write a fake SDK transcript for `sessionId` under the SHARED projects dir. */
function writeTranscript(sessionId: string): void {
  const projects = join(claudeProjectsDir(), "proj");
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
  writeTranscript("sess-1");
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
  writeTranscript("sess-1");
  const transcript = join(claudeProjectsDir(), "proj", "sess-1.jsonl");
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

test("a transcript stranded under a stale cwd slug is relocated so the SDK can resume it (HOU-892)", () => {
  // The agent was renamed: the workspace cwd changed, so the SDK's cwd-scoped
  // resume lookup misses the transcript written under the OLD slug. resolveResume
  // must move it into the CURRENT cwd's slug dir — preserving the conversation —
  // rather than declaring it resumable and letting the SDK reject the id.
  const cwd = "/ws/Personal/new name";
  const store = createSessionsStore(dataDir(), cwd);
  store.setSessionId("c1", "sess-1");
  writeTranscript("sess-1"); // lands under the unrelated "proj" slug dir

  expect(store.resolveResume("c1")).toBe("sess-1");

  const slugDir = join(claudeProjectsDir(), "-ws-Personal-new-name");
  expect(existsSync(join(slugDir, "sess-1.jsonl"))).toBe(true);
  expect(existsSync(join(claudeProjectsDir(), "proj", "sess-1.jsonl"))).toBe(
    false,
  );
  // Mapping survives — the next turn resumes normally with zero moves.
  expect(store.getSessionId("c1")).toBe("sess-1");
  expect(store.resolveResume("c1")).toBe("sess-1");
});

test("a transcript already under the current cwd slug is returned without moving", () => {
  const cwd = "/ws/Personal/agent";
  const store = createSessionsStore(dataDir(), cwd);
  store.setSessionId("c1", "sess-1");
  const slugDir = join(claudeProjectsDir(), "-ws-Personal-agent");
  mkdirSync(slugDir, { recursive: true });
  writeFileSync(join(slugDir, "sess-1.jsonl"), "{}");

  expect(store.resolveResume("c1")).toBe("sess-1");
  expect(existsSync(join(slugDir, "sess-1.jsonl"))).toBe(true);
});

test("without a cwd (purge-only store) resolveResume never relocates", () => {
  const store = createSessionsStore(dataDir());
  store.setSessionId("c1", "sess-1");
  writeTranscript("sess-1");
  expect(store.resolveResume("c1")).toBe("sess-1");
  // Untouched in place.
  expect(existsSync(join(claudeProjectsDir(), "proj", "sess-1.jsonl"))).toBe(
    true,
  );
});

test("two agents' transcripts under the shared projects dir don't collide", () => {
  // Different per-agent data dirs, DIFFERENT session ids → each resolves only
  // its own transcript even though the projects tree is shared.
  const a = createSessionsStore(dataDir());
  const b = createSessionsStore(dataDir());
  a.setSessionId("c", "sess-a");
  b.setSessionId("c", "sess-b");
  writeTranscript("sess-a");
  expect(a.resolveResume("c")).toBe("sess-a");
  // b's transcript isn't on disk yet → b starts fresh, doesn't pick up sess-a.
  expect(b.resolveResume("c")).toBeUndefined();
});
