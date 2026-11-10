import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  SessionManager,
  VIRTUAL_MODEL_STATE_ENTRY,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { resumeSessionManager } from "./session-files";
import { SESSION_LOG_ROTATION_BYTES } from "./session-rotation";
import {
  assistant,
  seedRotatableSession,
  sessionFile,
} from "./session-rotation.test-support";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function setup() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-rotation-"));
  roots.push(cwd);
  return { cwd, dir: join(cwd, "sessions") };
}

test.each([
  "local",
  "pooled",
])("%s resume preserves live context, state and leaf without touching the archive", (path) => {
  const { cwd, dir } = setup();
  const { manager, kept, response } = seedRotatableSession(cwd, dir);
  const original = sessionFile(manager);
  const bytes = readFileSync(original);
  const context = manager.buildSessionContext();
  expect(context.model).toEqual({
    provider: "anthropic",
    modelId: "physical-model",
  });
  expect(context.thinkingLevel).toBe("high");
  const resumedCwd = path === "local" ? cwd : setup().cwd;
  const successor = resumeSessionManager(resumedCwd, dir, false);
  const file = sessionFile(successor);
  expect(file).not.toBe(original);
  expect(basename(file) > basename(original)).toBe(true);
  expect(file).toMatch(/_test-session\.jsonl$/);
  expect(statSync(file).size).toBeLessThan(SESSION_LOG_ROTATION_BYTES);
  expect(readFileSync(original).equals(bytes)).toBe(true);
  expect(successor.getHeader()).toEqual(manager.getHeader());
  expect(successor.getCwd()).toBe(resumedCwd);
  expect(successor.buildSessionContext()).toEqual(context);
  expect(successor.getLeafId()).toBe(manager.getLeafId());
  expect(successor.getEntry(kept)?.id).toBe(kept);
  expect(successor.getSessionName()).toBe(manager.getSessionName());
  expect(successor.getLabel(response)).toBe("checkpoint");
  expect(successor.getBranch().filter((e) => e.type === "custom")).toEqual(
    manager
      .getBranch()
      .filter((e) => e.type === "custom")
      .map((e) => ({ ...e, parentId: successor.getEntry(e.id)?.parentId })),
  );
  expect(
    successor
      .getEntries()
      .some(
        (e) =>
          e.type === "custom" && e.customType === VIRTUAL_MODEL_STATE_ENTRY,
      ),
  ).toBe(true);

  // Unmodified pi can open it directly: no Houston-specific format or migration.
  expect(SessionManager.open(file).buildSessionContext()).toEqual(context);
  expect(resumeSessionManager(resumedCwd, dir, false).getSessionFile()).toBe(
    file,
  );
  expect(readdirSync(dir).sort()).toEqual(
    [basename(original), basename(file)].sort(),
  );
});

test("appending to the preserved leaf survives reopening", () => {
  const { cwd, dir } = setup();
  seedRotatableSession(cwd, dir);
  const manager = resumeSessionManager(cwd, dir, false);
  const leaf = manager.getLeafId();
  const appended = manager.appendMessage(assistant("next-model"));
  expect(manager.getEntry(appended)?.parentId).toBe(leaf);
  const reopened = resumeSessionManager(cwd, dir, false);
  expect(reopened.getSessionFile()).toBe(manager.getSessionFile());
  expect(reopened.getLeafId()).toBe(appended);
  expect(reopened.buildSessionContext()).toEqual(manager.buildSessionContext());
  expect(reopened.buildSessionContext().model?.modelId).toBe("next-model");
});

test.each([
  "under threshold",
  "no compaction",
  "large live segment",
])("does not rotate with %s", (scenario) => {
  const { cwd, dir } = setup();
  const manager = SessionManager.create(cwd, dir);
  manager.appendMessage({
    role: "user",
    content:
      scenario === "no compaction"
        ? "x".repeat(SESSION_LOG_ROTATION_BYTES + 1)
        : "old",
    timestamp: 0,
  });
  const kept = manager.appendMessage({
    role: "user",
    content:
      scenario === "large live segment"
        ? "x".repeat(SESSION_LOG_ROTATION_BYTES + 1)
        : "kept",
    timestamp: 1,
  });
  if (scenario !== "no compaction")
    manager.appendCompaction("summary", kept, 100_000);
  const file = sessionFile(manager);
  const bytes = readFileSync(file);
  expect(resumeSessionManager(cwd, dir, false).getSessionFile()).toBe(file);
  expect(readFileSync(file).equals(bytes)).toBe(true);
  expect(readdirSync(dir)).toEqual([basename(file)]);
});

test("full compaction with no kept messages preserves model and thinking settings", () => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  manager.appendCompaction("everything summarized", null, 100_000);
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).not.toBe(manager.getSessionFile());
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
  expect(resumed.getLeafId()).toBe(manager.getLeafId());
});

test("rotation advances a future filename and leaves an unterminated archive untouched", () => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  const original = join(dir, "2099-01-01T00-00-00-000Z_test-session.jsonl");
  renameSync(sessionFile(manager), original);
  const bytes = readFileSync(original, "utf8").trimEnd();
  writeFileSync(original, bytes);
  const torn = join(dir, "2099-01-01T00-00-00-001Z_test-session.jsonl");
  writeFileSync(torn, "");
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(basename(sessionFile(resumed)) > basename(torn)).toBe(true);
  expect(statSync(torn).size).toBe(0);
  expect(readFileSync(original, "utf8")).toBe(bytes);
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
});

test("an abandoned compaction cannot trim the active branch", () => {
  const { cwd, dir } = setup();
  const { manager, kept } = seedRotatableSession(cwd, dir);
  manager.branch(kept);
  manager.appendMessage({
    role: "user",
    content: "another branch",
    timestamp: 2,
  });
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).toBe(manager.getSessionFile());
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
});

test("large carried state does not rotate again on the next resume", () => {
  const { cwd, dir } = setup();
  const { manager } = seedRotatableSession(cwd, dir);
  manager.appendCustomEntry(
    "large-state",
    "x".repeat(SESSION_LOG_ROTATION_BYTES),
  );
  manager.appendThinkingLevelChange("max");
  manager.appendModelChange("anthropic", "latest-model");
  const resumed = resumeSessionManager(cwd, dir, false);
  expect(resumed.getSessionFile()).not.toBe(manager.getSessionFile());
  expect(statSync(sessionFile(resumed)).size).toBeGreaterThan(
    SESSION_LOG_ROTATION_BYTES,
  );
  expect(resumed.buildSessionContext()).toEqual(manager.buildSessionContext());
  expect(resumeSessionManager(cwd, dir, false).getSessionFile()).toBe(
    resumed.getSessionFile(),
  );
});
