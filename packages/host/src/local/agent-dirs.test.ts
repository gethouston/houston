import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveAgentDirFor } from "./agent-dirs";

describe("liveAgentDirFor", () => {
  let root: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `houston-agent-dirs-${process.pid}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an existing agent dir", () => {
    mkdirSync(join(root, "Personal", "bob"), { recursive: true });
    expect(liveAgentDirFor(root, "Personal/bob")).toBe(
      join(root, "Personal", "bob"),
    );
  });

  it("fails closed on a stale id — a spawn must never resurrect a renamed/deleted agent (HOU-827)", () => {
    expect(() => liveAgentDirFor(root, "Personal/gone")).toThrow(
      /agent directory for 'Personal\/gone' is gone/,
    );
    expect(existsSync(join(root, "Personal", "gone"))).toBe(false);
  });

  it("creates the hidden setup runtime's dir on demand — first-run provider connect has no other create path (HOU-1239)", () => {
    const dir = liveAgentDirFor(root, "Personal/.setup/connect");
    expect(dir).toBe(join(root, "Personal", ".setup", "connect"));
    expect(existsSync(dir)).toBe(true);
    // Idempotent on the next spawn.
    expect(liveAgentDirFor(root, "Personal/.setup/connect")).toBe(dir);
  });

  it("does NOT extend the carve-out to ordinary dot-less agents nested under real workspaces", () => {
    expect(() => liveAgentDirFor(root, "Personal/setup")).toThrow(/is gone/);
  });
});
