import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCurrentTools } from "@earendil-works/pi-ai";
import {
  parseSessionEntries,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { installRuntimeLogging } from "../../observability/logging";
import { resumeSessionManager } from "./session-files";
import { SESSION_LOG_ROTATION_BYTES } from "./session-rotation";
import {
  assistant,
  seedRotatableSession,
  sessionFile,
} from "./session-rotation.test-support";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function setup() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-rotation-review-"));
  roots.push(cwd);
  return { cwd, dir: join(cwd, "sessions") };
}

test.each([
  "prefix",
  "live",
])("an unknown %s entry skips rotation, reports and still resumes", async (position) => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  const file = sessionFile(manager);
  const original = readFileSync(file, "utf8");
  const future = JSON.stringify({
    type: "future_setting",
    id: "future",
    parentId: position === "live" ? manager.getLeafId() : null,
    timestamp: new Date().toISOString(),
  });
  const newline = original.indexOf("\n") + 1;
  writeFileSync(
    file,
    position === "live"
      ? `${original}${future}\n`
      : `${original.slice(0, newline)}${future}\n${original.slice(newline).replace('"parentId":null', '"parentId":"future"')}`,
  );
  const before = SessionManager.open(file, dir, cwd);
  expect(before.buildSessionContext()).toEqual(manager.buildSessionContext());
  const logs: string[] = [];
  const captures: { level: string; values: unknown[] }[] = [];
  const logging = installRuntimeLogging({
    sinks: [{ write: (line) => logs.push(line) }],
    capture: (level, values) => captures.push({ level, values }),
  });
  try {
    const resumed = resumeSessionManager(cwd, dir, false);
    expect(resumed.getSessionFile()).toBe(file);
    expect(resumed.buildSessionContext()).toEqual(before.buildSessionContext());
    expect(resumed.getLeafId()).toBe(before.getLeafId());
    expect(
      logs.some(
        (line) =>
          line.includes("level=ERROR") && line.includes("future_setting"),
      ),
    ).toBe(true);
    expect(
      captures.some(
        ({ level, values }) =>
          level === "ERROR" && values.some((value) => value instanceof Error),
      ),
    ).toBe(true);
  } finally {
    await logging.restore();
  }
});

test("rotation preserves the tool loadout replayed from branch system messages", () => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  const file = sessionFile(manager);
  const entries = parseSessionEntries(readFileSync(file, "utf8"));
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "system") {
      entry.message.toolsAdded = ["bash", "read", "web"].map((name) => ({
        name,
        description: name,
        parameters: { type: "object", properties: {} },
      }));
    }
  }
  writeFileSync(
    file,
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );
  const before = SessionManager.open(file, dir, cwd);
  const loadout = (session: SessionManager) =>
    getCurrentTools(
      session
        .getBranch()
        .flatMap((entry) =>
          entry.type === "message" && entry.message.role === "system"
            ? [entry.message]
            : [],
        ),
    );
  expect(loadout(before).map((tool) => tool.name)).toEqual([
    "bash",
    "read",
    "web",
  ]);
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).not.toBe(file);
  expect(loadout(resumed)).toEqual(loadout(before));
  expect(resumed.buildSessionContext()).toEqual(before.buildSessionContext());
});

test.each([
  false,
  true,
])("a large live file with compaction=%s is fully parsed only by pi", (compacted) => {
  const { cwd, dir } = setup();
  const manager = SessionManager.create(cwd, dir);
  const kept = manager.appendMessage({
    role: "user",
    content: "x".repeat(SESSION_LOG_ROTATION_BYTES + 1024),
    timestamp: 0,
  });
  if (compacted) manager.appendCompaction("summary", kept, 100_000);
  const fullRotationParse = vi.spyOn(SessionManager, "inMemory");
  expect(resumeSessionManager(cwd, dir, false).getSessionFile()).toBe(
    manager.getSessionFile(),
  );
  expect(fullRotationParse).not.toHaveBeenCalled();
});

test("a non-ISO newest filename stays authoritative across appends", () => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  const file = join(dir, "z-session.jsonl");
  renameSync(sessionFile(manager), file);
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).toBe(file);
  resumed.appendMessage(assistant("next-model"));
  const reopened = resumeSessionManager(cwd, dir, false);
  expect(reopened.getSessionFile()).toBe(file);
  expect(reopened.buildSessionContext()).toEqual(resumed.buildSessionContext());
  expect(readdirSync(dir)).toEqual(["z-session.jsonl"]);
});
