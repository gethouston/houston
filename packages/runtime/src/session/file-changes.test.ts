import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { diffSnapshots, snapshotWorkspace } from "./file-changes";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "houston-filechanges-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("announces every file the Files tab would show, whatever the extension", () => {
  // The chat card and the Files tab must agree: an agent-created file that
  // shows in the tab is announced in chat. The old extension allowlist hid
  // extensionless files ("create a file named ping") — the tab showed them,
  // the chat said nothing (HOU-677 follow-up).
  const before = snapshotWorkspace(dir);

  writeFileSync(join(dir, "deck.pptx"), "ppt");
  writeFileSync(join(dir, "ping"), "pong");
  writeFileSync(join(dir, "make_deck.py"), "print('x')");
  writeFileSync(join(dir, ".env"), "SECRET=1"); // dot-files stay hidden

  const changes = diffSnapshots(before, snapshotWorkspace(dir));
  expect(changes.created).toEqual(["deck.pptx", "make_deck.py", "ping"]);
  expect(changes.modified).toEqual([]);
});

test("markdown deliverables tracked but role files ignored", () => {
  // Markdown reports are user deliverables and must appear in the chat
  // file-change summary. The seeded role files (CLAUDE.md, AGENTS.md,
  // GEMINI.md) must NOT — otherwise every agent's first session would
  // falsely report creating its own instructions.
  const before = snapshotWorkspace(dir);

  writeFileSync(join(dir, "CLAUDE.md"), "role");
  writeFileSync(join(dir, "AGENTS.md"), "role");
  writeFileSync(join(dir, "GEMINI.md"), "role");
  writeFileSync(join(dir, "summary.md"), "# Summary");

  const changes = diffSnapshots(before, snapshotWorkspace(dir));
  expect(changes.created).toEqual(["summary.md"]);
  expect(changes.modified).toEqual([]);
});

test("detects modified visible files", async () => {
  const path = join(dir, "brief.txt");
  writeFileSync(path, "first");
  const before = snapshotWorkspace(dir);

  await sleep(5);
  writeFileSync(path, "second!");

  const changes = diffSnapshots(before, snapshotWorkspace(dir));
  expect(changes.created).toEqual([]);
  expect(changes.modified).toEqual(["brief.txt"]);
});

test("recurses into folders but skips dot-dirs and dependency dirs", () => {
  const before = snapshotWorkspace(dir);

  mkdirSync(join(dir, "reports"));
  writeFileSync(join(dir, "reports", "q3.pdf"), "pdf");
  mkdirSync(join(dir, ".houston"));
  writeFileSync(join(dir, ".houston", "notes.md"), "internal");
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "node_modules", "readme.md"), "dep");

  const changes = diffSnapshots(before, snapshotWorkspace(dir));
  expect(changes.created).toEqual(["reports/q3.pdf"]);
});

test("deletions are not reported", () => {
  writeFileSync(join(dir, "gone.txt"), "bye");
  const before = snapshotWorkspace(dir);
  rmSync(join(dir, "gone.txt"));

  const changes = diffSnapshots(before, snapshotWorkspace(dir));
  expect(changes.created).toEqual([]);
  expect(changes.modified).toEqual([]);
});
