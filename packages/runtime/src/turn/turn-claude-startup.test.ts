import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  armClaudeStartupProfile,
  CLAUDE_STARTUP_PROFILE_RATE,
  claudeStartupProfileEnv,
  collectClaudeStartupProfile,
  parseClaudeStartupProfile,
  takeClaudeStartupProfile,
} from "./turn-claude-startup";
import { turnTerminalFrame } from "./turn-terminal";

// The shape Claude Code 2.1.310 writes to startup-perf/<session>.json.
const REPORT = {
  metadata: { init_network_ms: 40, import_time_ms: 105, late: false },
  marks: [
    { name: "profiler_initialized", startTime: 18.4 },
    { name: "init_network_configured", startTime: 283.2 },
    { name: "init_network_configured", startTime: 900 },
    { name: "before_connectMcp", startTime: 603 },
    { name: "bad name!", startTime: 1 },
    { name: "before_loadInitialMessages", startTime: 614.2 },
  ],
  memory: [],
  nodeBootMs: 12,
};

afterEach(() => takeClaudeStartupProfile());

function configDirWith(files: Record<string, string>): string {
  const configDir = mkdtempSync(join(tmpdir(), "claude-startup-"));
  mkdirSync(join(configDir, "startup-perf"));
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(configDir, "startup-perf", name), body);
  return configDir;
}

test("samples about one turn in twenty", () => {
  expect(CLAUDE_STARTUP_PROFILE_RATE).toBe(0.05);
  armClaudeStartupProfile(() => 0.049);
  expect(claudeStartupProfileEnv()).toEqual({
    CLAUDE_CODE_PROFILE_STARTUP: "1",
  });
  armClaudeStartupProfile(() => 0.05);
  expect(claudeStartupProfileEnv()).toEqual({});
});

test("flattens marks, phases and node boot into whole-ms entries", () => {
  expect(parseClaudeStartupProfile(REPORT)).toEqual({
    profiler_initialized: 18,
    init_network_configured: 283,
    before_connectMcp: 603,
    before_loadInitialMessages: 614,
    "phase.init_network": 40,
    "phase.import_time": 105,
    node_boot: 12,
  });
  expect(parseClaudeStartupProfile({ metadata: {} })).toBeUndefined();
  expect(parseClaudeStartupProfile({ marks: [] })).toBeUndefined();
  expect(parseClaudeStartupProfile("STARTUP PROFILING REPORT")).toBeUndefined();
});

test("a sampled turn's report reaches its terminal frame once, and the folder never syncs", () => {
  const configDir = configDirWith({
    "s1.txt": "STARTUP PROFILING REPORT",
    "s1.json": JSON.stringify(REPORT),
  });
  armClaudeStartupProfile(() => 0);
  collectClaudeStartupProfile(configDir);
  expect(existsSync(join(configDir, "startup-perf"))).toBe(false);

  const frame = turnTerminalFrame({}, "turn-1", 0, undefined, undefined, [], {
    t_arrived: 1,
  });
  expect(frame.data).toMatchObject({
    timingsMs: { arrived: 0 },
    claudeStartupMs: { init_network_configured: 283, node_boot: 12 },
  });
  const next = turnTerminalFrame({}, "turn-1", 0, undefined, undefined, [], {
    t_arrived: 1,
  });
  expect(next.data).not.toHaveProperty("claudeStartupMs");
});

test("an unsampled turn neither reads nor removes anything", () => {
  const configDir = configDirWith({ "s1.json": JSON.stringify(REPORT) });
  armClaudeStartupProfile(() => 0.9);
  collectClaudeStartupProfile(configDir);
  expect(existsSync(join(configDir, "startup-perf", "s1.json"))).toBe(true);
  expect(takeClaudeStartupProfile()).toBeUndefined();
});

test("a corrupt or missing report costs only the sample", () => {
  armClaudeStartupProfile(() => 0);
  collectClaudeStartupProfile(join(tmpdir(), "claude-startup-none"));
  const configDir = configDirWith({ "s1.json": "{not json" });
  collectClaudeStartupProfile(configDir);
  expect(existsSync(join(configDir, "startup-perf"))).toBe(false);
  expect(takeClaudeStartupProfile()).toBeUndefined();
});
