import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  AgentSettingsWriteDeniedError,
  PathDeniedError,
  UnsavedWriteError,
  WorkspaceGuard,
} from "./fs-guard";

const KEPT = new Set([".houston/state.json", "notes.md", ".houston/state"]);

function guards() {
  const root = mkdtempSync(join(tmpdir(), "fs-guard-kept-"));
  mkdirSync(join(root, ".houston", "config"), { recursive: true });
  return {
    root,
    pooled: new WorkspaceGuard(root, { keepsWrite: (rel) => KEPT.has(rel) }),
    standing: new WorkspaceGuard(root),
  };
}

test("a pooled turn writes the files its sync keeps", () => {
  const { root, pooled } = guards();
  expect(pooled.clampWrite(".houston/state.json")).toBe(
    join(pooled.root, ".houston", "state.json"),
  );
  expect(pooled.assertWritable(join(root, "notes.md"))).toBe(
    join(pooled.root, "notes.md"),
  );
});

test("a pooled turn is told its settings are changed in the app", () => {
  const { root, pooled } = guards();
  expect(() => pooled.clampWrite(".houston/config/config.json")).toThrow(
    AgentSettingsWriteDeniedError,
  );
  expect(() =>
    pooled.assertWritable(join(root, ".houston", "config", "config.json")),
  ).toThrow(AgentSettingsWriteDeniedError);
  expect(() => pooled.clampWrite(".houston/config.json")).toThrow(
    AgentSettingsWriteDeniedError,
  );
  expect(() => pooled.clampWrite(".HOUSTON/Config/config.json")).toThrow(
    AgentSettingsWriteDeniedError,
  );
});

test("a pooled turn is refused a Houston file its sync would drop", () => {
  const { pooled } = guards();
  expect(() => pooled.clampWrite(".houston/agent.json")).toThrow(
    new UnsavedWriteError(".houston/agent.json"),
  );
  expect(() => pooled.clampWrite(".houston/skills/x/SKILL.md")).toThrow(
    UnsavedWriteError,
  );
});

test("folders are made freely: the file written inside is what is judged", () => {
  const { root, pooled } = guards();
  expect(pooled.assertWritableDir(join(root, ".houston"))).toBe(
    join(pooled.root, ".houston"),
  );
  expect(pooled.assertWritableDir(pooled.root)).toBe(pooled.root);
});

test("credential material stays denied before the kept rule", () => {
  const { pooled } = guards();
  expect(() => pooled.clampWrite(".houston/runtime/auth.json")).toThrow(
    PathDeniedError,
  );
});

test("a desktop or standing runtime keeps every write, settings included", () => {
  const { standing } = guards();
  expect(standing.clampWrite(".houston/config/config.json")).toBe(
    join(standing.root, ".houston", "config", "config.json"),
  );
  expect(standing.clampWrite(".houston/agent.json")).toBe(
    join(standing.root, ".houston", "agent.json"),
  );
});
