import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { claudeProjectsDir, serverClaudeLayout } from "./paths";
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

function sessionsStore(dataDir: string, cwd?: string) {
  return createSessionsStore({
    ...serverClaudeLayout(dataDir),
    ...(cwd ? { cwd } : {}),
  });
}

/** Write a fake SDK transcript for `sessionId` under the SHARED projects dir. */
function writeTranscript(sessionId: string): void {
  const projects = join(claudeProjectsDir(), "proj");
  mkdirSync(projects, { recursive: true });
  writeFileSync(join(projects, `${sessionId}.jsonl`), "{}");
}

test("set / get round-trips and persists across store instances", () => {
  const dir = dataDir();
  sessionsStore(dir).setSessionId("c1", "sess-1");
  expect(sessionsStore(dir).getSessionId("c1")).toBe("sess-1");
});

test("the sessions file is written with mode 0600", () => {
  const dir = dataDir();
  sessionsStore(dir).setSessionId("c1", "sess-1");
  const mode = statSync(join(dir, "backends", "claude", "sessions.json")).mode;
  expect(mode & 0o777).toBe(0o600);
});

test("remove forgets a mapping", () => {
  const dir = dataDir();
  const store = sessionsStore(dir);
  store.setSessionId("c1", "sess-1");
  store.remove("c1");
  expect(store.getSessionId("c1")).toBeUndefined();
});

test("resolveResume returns the id when its transcript exists", () => {
  const dir = dataDir();
  const store = sessionsStore(dir);
  store.setSessionId("c1", "sess-1");
  writeTranscript("sess-1");
  expect(store.resolveResume("c1")).toBe("sess-1");
});

test("resolveResume with no mapping returns undefined", () => {
  expect(sessionsStore(dataDir()).resolveResume("nope")).toBeUndefined();
});

test("a missing transcript warns, drops the mapping, and starts fresh", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const dir = dataDir();
  const store = sessionsStore(dir);
  store.setSessionId("c1", "sess-gone");
  // No transcript on disk → resume is impossible.
  expect(store.resolveResume("c1")).toBeUndefined();
  expect(warn).toHaveBeenCalled();
  // The dangling mapping is dropped so we don't warn on every subsequent turn.
  expect(store.getSessionId("c1")).toBeUndefined();
});

test("purge drops the mapping AND deletes the transcript", () => {
  const dir = dataDir();
  const store = sessionsStore(dir);
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
  expect(() => sessionsStore(dir).purge("never")).not.toThrow();
});

test("a corrupt sessions.json degrades to empty rather than throwing", () => {
  const dir = dataDir();
  mkdirSync(join(dir, "backends", "claude"), { recursive: true });
  writeFileSync(join(dir, "backends", "claude", "sessions.json"), "{not json");
  expect(sessionsStore(dir).getSessionId("c1")).toBeUndefined();
});

test("a transcript stranded under a stale cwd slug is relocated so the SDK can resume it (HOU-892)", () => {
  // The agent was renamed: the workspace cwd changed, so the SDK's cwd-scoped
  // resume lookup misses the transcript written under the OLD slug. resolveResume
  // must move it into the CURRENT cwd's slug dir — preserving the conversation —
  // rather than declaring it resumable and letting the SDK reject the id.
  const cwd = "/ws/Personal/new name";
  const store = sessionsStore(dataDir(), cwd);
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
  const store = sessionsStore(dataDir(), cwd);
  store.setSessionId("c1", "sess-1");
  const slugDir = join(claudeProjectsDir(), "-ws-Personal-agent");
  mkdirSync(slugDir, { recursive: true });
  writeFileSync(join(slugDir, "sess-1.jsonl"), "{}");

  expect(store.resolveResume("c1")).toBe("sess-1");
  expect(existsSync(join(slugDir, "sess-1.jsonl"))).toBe(true);
});

test("duplicate transcripts relocate the newest copy by mtime", () => {
  const cwd = "/ws/Personal/current";
  const store = sessionsStore(dataDir(), cwd);
  store.setSessionId("c1", "sess-1");
  const oldDir = join(claudeProjectsDir(), "a-old");
  const newDir = join(claudeProjectsDir(), "z-new");
  mkdirSync(oldDir, { recursive: true });
  mkdirSync(newDir, { recursive: true });
  const oldCopy = join(oldDir, "sess-1.jsonl");
  const newCopy = join(newDir, "sess-1.jsonl");
  writeFileSync(oldCopy, "old");
  writeFileSync(newCopy, "new");
  utimesSync(oldCopy, new Date(1_000), new Date(1_000));
  utimesSync(newCopy, new Date(2_000), new Date(2_000));

  expect(store.resolveResume("c1")).toBe("sess-1");

  const current = join(
    claudeProjectsDir(),
    "-ws-Personal-current",
    "sess-1.jsonl",
  );
  expect(readFileSync(current, "utf8")).toBe("new");
  expect(existsSync(oldCopy)).toBe(true);
});

test("without a cwd (purge-only store) resolveResume never relocates", () => {
  const store = sessionsStore(dataDir());
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
  const a = sessionsStore(dataDir());
  const b = sessionsStore(dataDir());
  a.setSessionId("c", "sess-a");
  b.setSessionId("c", "sess-b");
  writeTranscript("sess-a");
  expect(a.resolveResume("c")).toBe("sess-a");
  // b's transcript isn't on disk yet → b starts fresh, doesn't pick up sess-a.
  expect(b.resolveResume("c")).toBeUndefined();
});
