import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { resumeSessionManager } from "./session-files";

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
  const dir = mkdtempSync(join(tmpdir(), "pi-sessions-"));
  seedSession(dir, "2026-08-24T01-00-00-000Z_old.jsonl", "/tmp/turn-root-A/ws");
  const newest = seedSession(
    dir,
    "2026-08-24T02-00-00-000Z_new.jsonl",
    "/tmp/turn-root-B/ws",
  );
  const thisTurnRoot = mkdtempSync(join(tmpdir(), "turn-root-C-"));
  const past = new Date(Date.now() - 3_600_000);
  utimesSync(newest, past, past);

  const broken = SessionManager.continueRecent(thisTurnRoot, dir);
  expect(broken.getSessionFile()).not.toBe(newest);

  const fixed = resumeSessionManager(thisTurnRoot, dir, false);
  expect(fixed.getSessionFile()).toBe(newest);
  expect(fixed.getCwd()).toBe(thisTurnRoot);

  writeFileSync(join(dir, "2026-08-24T03-00-00-000Z_torn.jsonl"), "");
  writeFileSync(join(dir, "2026-08-24T03-01-00-000Z_junk.jsonl"), "not json\n");
  expect(resumeSessionManager(thisTurnRoot, dir, false).getSessionFile()).toBe(
    newest,
  );

  expect(
    resumeSessionManager(thisTurnRoot, dir, true).getSessionFile(),
  ).not.toBe(newest);

  const empty = mkdtempSync(join(tmpdir(), "pi-sessions-empty-"));
  const started = resumeSessionManager(
    thisTurnRoot,
    join(empty, "none"),
    false,
  );
  expect(started.getSessionFile()).not.toBe(newest);
});
