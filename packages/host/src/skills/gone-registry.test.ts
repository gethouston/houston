import { expect, test } from "vitest";
import { GoneRegistry } from "./gone-registry";

test("GoneRegistry answers gone for a repo and every skill in it, case-insensitively", () => {
  const gone = new GoneRegistry({ now: () => 0 });
  gone.markRepoGone("Sales-Skills/Sales");
  expect(gone.isGone("sales-skills/sales")).toBe(true);
  expect(gone.isGone("sales-skills/sales", "sales-kit")).toBe(true);
  expect(gone.isGone("other/repo", "sales-kit")).toBe(false);
});

test("GoneRegistry scopes a skill mark to that skill only", () => {
  const gone = new GoneRegistry({ now: () => 0 });
  gone.markSkillGone("openai/skills", "spreadsheet");
  expect(gone.isGone("openai/skills", "spreadsheet")).toBe(true);
  expect(gone.isGone("openai/skills", "pdf")).toBe(false);
  expect(gone.isGone("openai/skills")).toBe(false);
});

test("GoneRegistry forgets a mark after the TTL", () => {
  const clock = { t: 0 };
  const gone = new GoneRegistry({ now: () => clock.t, ttlMs: 1_000 });
  gone.markRepoGone("owner/repo");
  clock.t = 1_000;
  expect(gone.isGone("owner/repo")).toBe(true);
  clock.t = 1_001;
  expect(gone.isGone("owner/repo")).toBe(false);
});

test("GoneRegistry evicts the oldest mark beyond maxEntries", () => {
  const gone = new GoneRegistry({ now: () => 0, maxEntries: 2 });
  gone.markRepoGone("a/a");
  gone.markRepoGone("b/b");
  gone.markRepoGone("c/c");
  expect(gone.isGone("a/a")).toBe(false);
  expect(gone.isGone("b/b")).toBe(true);
  expect(gone.isGone("c/c")).toBe(true);
});
