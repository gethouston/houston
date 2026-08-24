import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { resumeSessionManager } from "./backend";

function seedSession(dir: string, name: string, cwd: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(
    file,
    `${JSON.stringify({
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: name.replace(/\.jsonl$/, ""),
      timestamp: new Date().toISOString(),
      cwd,
    })}\n`,
  );
  return file;
}

test("resumes the conversation's newest session even when it was written under another root", () => {
  // The pool bug: every worker turn hydrates the agent into a fresh temp
  // root, so the cwd recorded in the previous turn's session header never
  // matches — continueRecent started a BLANK session per turn and the model
  // had no memory of the conversation.
  const dir = mkdtempSync(join(tmpdir(), "pi-sessions-"));
  seedSession(dir, "2026-08-24T01-00-00-000Z_old.jsonl", "/tmp/turn-root-A/ws");
  const newest = seedSession(
    dir,
    "2026-08-24T02-00-00-000Z_new.jsonl",
    "/tmp/turn-root-B/ws",
  );
  const thisTurnRoot = mkdtempSync(join(tmpdir(), "turn-root-C-"));
  // Pin FILENAME order, not mtime: hydration rewrites mtimes in download
  // order, so make the newest-NAMED file the oldest-by-mtime.
  const past = new Date(Date.now() - 3_600_000);
  utimesSync(newest, past, past);

  // The old call finds nothing under a different cwd — the bug: it does
  // NOT reopen the newest file.
  const broken = SessionManager.continueRecent(thisTurnRoot, dir);
  expect(broken.getSessionFile()).not.toBe(newest);

  // The fix reopens the newest file at THIS turn's root.
  const fixed = resumeSessionManager(thisTurnRoot, dir, false);
  expect(fixed.getSessionFile()).toBe(newest);
  expect(fixed.getCwd()).toBe(thisTurnRoot);

  // A corrupt newer file (a crash mid-write) must not be opened and
  // rewritten as a blank session: skip to the newest READABLE one.
  writeFileSync(join(dir, "2026-08-24T03-00-00-000Z_torn.jsonl"), "");
  writeFileSync(join(dir, "2026-08-24T03-01-00-000Z_junk.jsonl"), "not json\n");
  expect(resumeSessionManager(thisTurnRoot, dir, false).getSessionFile()).toBe(
    newest,
  );

  // A cross-backend rebuild still starts clean (HOU-951).
  expect(
    resumeSessionManager(thisTurnRoot, dir, true).getSessionFile(),
  ).not.toBe(newest);

  // An empty conversation starts a new session (no throw on a missing dir).
  const empty = mkdtempSync(join(tmpdir(), "pi-sessions-empty-"));
  const started = resumeSessionManager(
    thisTurnRoot,
    join(empty, "none"),
    false,
  );
  expect(started.getSessionFile()).not.toBe(newest);
});
