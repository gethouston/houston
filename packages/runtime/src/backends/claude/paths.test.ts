import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { claudeLoginConfigDir, claudeProjectsDir, houstonHome } from "./paths";

const saved = process.env.HOUSTON_HOME;
afterEach(() => {
  if (saved === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = saved;
});

test("claudeLoginConfigDir roots at HOUSTON_HOME/claude-login (workspace-shared)", () => {
  process.env.HOUSTON_HOME = "/home/x/.houston";
  // Not the per-agent dataDir: one dir all agents share, so a single login
  // connects every agent, and the Tauri shell (houston_dir()/claude-login)
  // derives the identical path.
  expect(claudeLoginConfigDir()).toBe("/home/x/.houston/claude-login");
  expect(claudeProjectsDir()).toBe("/home/x/.houston/claude-login/projects");
});

test("claudeLoginConfigDir takes an explicit home for testability", () => {
  expect(claudeLoginConfigDir("/data/root")).toBe(
    join("/data/root", "claude-login"),
  );
});

test("houstonHome honors HOUSTON_HOME", () => {
  process.env.HOUSTON_HOME = "/opt/houston";
  expect(houstonHome()).toBe("/opt/houston");
});
