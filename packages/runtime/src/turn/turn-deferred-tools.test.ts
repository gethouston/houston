import { expect, test } from "vitest";
import { deferredNeed } from "./turn-deferred-tools";

const WS = "/store/workspaces/Personal/Bob";

test("file tools name the one path they touch, on both harnesses", () => {
  expect(deferredNeed("Read", { file_path: "docs/a.md" }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/docs/a.md`],
  });
  expect(deferredNeed("Edit", { file_path: `${WS}/b.md` }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/b.md`],
  });
  expect(
    deferredNeed("NotebookEdit", { notebook_path: "n.ipynb" }, WS),
  ).toEqual({ kind: "paths", paths: [`${WS}/n.ipynb`] });
  expect(deferredNeed("write", { path: "out/r.md" }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/out/r.md`],
  });
});

test("searches name their folder, narrowed by a glob's fixed prefix", () => {
  expect(deferredNeed("Glob", { pattern: "docs/**/*.md" }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/docs`],
    folder: true,
  });
  expect(deferredNeed("Glob", { pattern: "**/*.md" }, WS)).toEqual({
    kind: "paths",
    paths: [WS],
    folder: true,
  });
  expect(deferredNeed("Grep", { pattern: "a.*b", path: "notes" }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/notes`],
    folder: true,
  });
  expect(deferredNeed("find", { pattern: "*.ts", path: "src" }, WS)).toEqual({
    kind: "paths",
    paths: [`${WS}/src`],
    folder: true,
  });
  expect(deferredNeed("ls", {}, WS)).toEqual({
    kind: "paths",
    paths: [WS],
    folder: true,
  });
});

test("shells and code runs need the whole tree; everything else needs nothing", () => {
  expect(deferredNeed("Bash", { command: "ls" }, WS)).toEqual({ kind: "all" });
  expect(deferredNeed("bash", { command: "ls" }, WS)).toEqual({ kind: "all" });
  expect(deferredNeed("mcp__houston__run_code", {}, WS)).toEqual({
    kind: "all",
  });
  for (const name of [
    "WebSearch",
    "WebFetch",
    "TodoWrite",
    "mcp__houston__integration_execute",
    "mcp__houston__ask_user",
    "browser",
  ])
    expect(deferredNeed(name, {}, WS)).toEqual({ kind: "none" });
  expect(deferredNeed("Read", { file_path: 7 }, WS)).toEqual({ kind: "none" });
});
