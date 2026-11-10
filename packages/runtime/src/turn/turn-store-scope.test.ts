import { expect, test } from "vitest";
import { claimedStoreScope } from "./turn-store-scope";

const A = "workspaces/W/Bob";
const R = `${A}/.houston/runtime`;
const scope = claimedStoreScope(A, "chat 1");

test.each([
  ["custom-integrations.json", true],
  ["workspaces/ws/prefs.json", true],
  [`${A}/CLAUDE.md`, true],
  [`${A}/.agents/skills/brief/SKILL.md`, true],
  [`${A}/.houston/activity/activity.json`, true],
  [`${R}/settings.json`, true],
  [`${R}/claude-flags/u1.json`, true],
  [`${R}/conversations/chat%201.archive/3.json`, true],
  [`${R}/sessions/chat 1/1.jsonl`, true],
  // The turn's own transcript is read by key, not listed.
  [`${R}/conversations/chat%201.json`, false],
  [`${R}/conversations/routine-r1.json`, false],
  [`${R}/conversations/routine-r1.archive/1.json`, false],
  [`${R}/sessions/routine-r1/1.jsonl`, false],
  [`${R}/sessions/chat 10/1.jsonl`, false],
  [`${A}/.repo-site/README.md`, false],
  [`${A}/uploads/photo.png`, false],
  [".pnpm-store/v10/index.json", false],
  ["claude-login/state.json", false],
])("critical(%s) is %s", (rel, critical) => {
  expect(scope.critical(rel)).toBe(critical);
});

test("the agent's own folders are listed later, under this agent only", () => {
  expect(scope.later(`${A}/.repo-site/README.md`)).toBe(true);
  expect(scope.later(`${A}/uploads/photo.png`)).toBe(true);
  expect(scope.later(`${A}/CLAUDE.md`)).toBe(false);
  expect(scope.later(`${A}/.houston/runtime/settings.json`)).toBe(false);
  expect(scope.later("workspaces/W/Other/uploads/x.png")).toBe(false);
  expect(scope.laterFolder(`${A}/uploads`)).toBe(true);
  expect(scope.laterFolder(`${A}/.houston`)).toBe(false);
  expect(scope.laterFolder(`${A}/uploads/2026`)).toBe(false);
});

test("the turn's own transcript is read by key", () => {
  expect(scope.conversation).toBe(`${R}/conversations/chat%201.json`);
});
