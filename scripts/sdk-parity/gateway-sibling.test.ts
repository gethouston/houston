import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  cloudCheckoutRoot,
  defaultCheckout,
  gitContainsCommit,
} from "./gateway-sibling.ts";

const CLOUD_ROOT = "HOUSTON_CLOUD_ROOT";
const original = process.env[CLOUD_ROOT];

afterEach(() => {
  if (original === undefined) delete process.env[CLOUD_ROOT];
  else process.env[CLOUD_ROOT] = original;
});

test("an unset or blank HOUSTON_CLOUD_ROOT names the sibling checkout", () => {
  delete process.env[CLOUD_ROOT];
  const beside = defaultCheckout();
  expect(beside.configured).toBe(false);
  expect(beside.root.endsWith("/cloud")).toBe(true);
  // A variable exported empty by a shell profile is not a path to a checkout.
  process.env[CLOUD_ROOT] = "  ";
  expect(defaultCheckout()).toEqual(beside);
});

test("a set HOUSTON_CLOUD_ROOT is the checkout, and is answerable for it", () => {
  const dir = mkdtempSync(join(tmpdir(), "cloud-root-"));
  process.env[CLOUD_ROOT] = dir;
  expect(cloudCheckoutRoot()).toBe(resolve(dir));
  expect(defaultCheckout()).toEqual({
    root: resolve(dir),
    routes: resolve(dir, "internal/edge/routes.generated.json"),
    configured: true,
  });
});

/** A throwaway repository with two commits on its only branch. */
function repoWithTwoCommits(): { root: string; first: string; second: string } {
  const root = mkdtempSync(join(tmpdir(), "cloud-checkout-"));
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@houston.invalid");
  git("config", "user.name", "Test");
  writeFileSync(join(root, "routes.json"), "[]");
  git("add", "routes.json");
  git("commit", "-qm", "first");
  const first = git("rev-parse", "HEAD");
  writeFileSync(join(root, "routes.json"), "[1]");
  git("commit", "-qam", "second");
  return { root, first, second: git("rev-parse", "HEAD") };
}

test("git decides whether a checkout carries the stamped commit", () => {
  const { root, first, second } = repoWithTwoCommits();
  expect(gitContainsCommit(root, first)).toBe(true);
  expect(gitContainsCommit(root, second)).toBe(true);
  // A checkout parked on the earlier commit does not carry the later one —
  // the shape of a branch cut before the vendoring, which must not warn.
  execFileSync("git", ["-C", root, "reset", "-q", "--hard", first]);
  expect(gitContainsCommit(root, second)).toBe(false);
  expect(gitContainsCommit(root, "f".repeat(40))).toBe(false);
});

test("a directory git knows nothing about carries no commit", () => {
  expect(
    gitContainsCommit(
      mkdtempSync(join(tmpdir(), "not-a-repo-")),
      "0".repeat(40),
    ),
  ).toBe(false);
});
