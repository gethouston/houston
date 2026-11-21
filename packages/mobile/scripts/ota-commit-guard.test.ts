import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

const guard = path.resolve(import.meta.dirname, "ota-commit-guard.sh");
let repo = "";
const shas: Record<string, string> = {};
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const commit = (name: string) => {
  git("commit", "--allow-empty", "-q", "-m", name);
  shas[name] = git("rev-parse", "HEAD");
};
const cut = (version: string, base: string, commits = ["release"]) => {
  git("checkout", "-q", "--detach", shas[base] ?? "");
  for (const name of commits) commit(`${name} ${version}`);
  git("tag", "-a", `cloud-v${version}`, "-m", version);
  git("checkout", "-q", "main");
};

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "ota-guard-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "test");
  commit("m1");
  commit("m2");
  cut("1.0.6", "m2");
  commit("m3");
  cut("1.0.7", "m3");
  commit("m4");
  cut("1.0.8", "m4", ["docs(release-notes)", "release"]);
  cut("1.0.9", "m4", ["release", "ci(release)"]);
  cut("1.0.10", "m4", ["hotfix-a", "hotfix-b", "release"]);
  cut("0.9.0", "m1", ["hotfix", "release"]);
  cut("2.0.0", "m4", ["notes", "release"]);
  commit("m5");
  cut("2.0.1", "m5", ["notes", "release"]);
  git(
    "merge",
    "-q",
    "--no-ff",
    "-m",
    "merge notes 2.0.0",
    shas["notes 2.0.0"] ?? "",
  );
  cut("1.5.0", "m5", ["hotfix", "release"]);
  for (let i = 0; i < 25; i++) commit(`late ${i}`);
  cut("3.0.0", "late 24");
  git("merge", "-q", "--no-ff", "-m", "merge back 1.5.0", "cloud-v1.5.0");
  git("checkout", "-q", "--detach", shas.m4 ?? "");
  for (let i = 0; i < 21; i++) commit(`far ${i}`);
  git("tag", "-a", "cloud-v9.9.9", "-m", "far");
  git("checkout", "-q", "main");
  git("checkout", "-q", "-b", "feature", shas.m3 ?? "");
  commit("f1");
  git("checkout", "-q", "main");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const run = (candidate: string, live = "") =>
  spawnSync(guard, ["main", candidate, live], { cwd: repo, encoding: "utf8" });

test("a tagged release cut from main publishes over the previous release", () => {
  const live = shas["release 1.0.6"]?.slice(0, 7) ?? "";
  expect(run("cloud-v1.0.7", live).status).toBe(0);
  expect(run("cloud-v1.0.6").status).toBe(0);
});

test("a main push publishes over a live release bundle cut from older main", () => {
  expect(run(shas.m3 ?? "", shas["release 1.0.6"]?.slice(0, 7)).status).toBe(0);
});

test("an older release cannot replace a newer live bundle", () => {
  const result = run("cloud-v1.0.6", shas["release 1.0.7"]?.slice(0, 7));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("older than the live bundle");
  expect(run("cloud-v1.0.6", shas.m3).status).not.toBe(0);
});

test("an untagged commit off main never publishes, even one commit away", () => {
  const result = run(shas.f1 ?? "");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("neither on main nor a cloud-v release");
});

test("hand cuts publish: notes commit, CI fix on top, cherry-picked hotfixes", () => {
  const live = shas["release 1.0.7"]?.slice(0, 7);
  for (const tag of ["cloud-v1.0.8", "cloud-v1.0.9", "cloud-v1.0.10"])
    expect(run(tag, live).status, tag).toBe(0);
  expect(run("cloud-v1.0.8", shas["ci(release) 1.0.9"]).status).toBe(0);
});

test("a hotfix release cut from older main cannot replace a newer live bundle", () => {
  const result = run("cloud-v0.9.0", shas["release 1.0.6"]?.slice(0, 7));
  expect(result.status).not.toBe(0);
  expect(run("cloud-v0.9.0").status).toBe(0);
});

test("a tag far off main is refused", () => {
  const result = run("cloud-v9.9.9");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("commits off main");
});

test("releases whose main bases diverge are not provably older and publish", () => {
  const result = run("cloud-v2.0.1", shas["release 2.0.0"]?.slice(0, 7));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("branch from main separately");
});

test("an old release merged back into main cannot replace a newer live bundle", () => {
  const result = run("cloud-v1.5.0", shas["release 3.0.0"]?.slice(0, 7));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("lacks");
});
