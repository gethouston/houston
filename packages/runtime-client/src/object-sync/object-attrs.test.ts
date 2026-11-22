import { expect, test } from "vitest";
import { linkTargetProblem } from "./object-attrs";
import { parseDirManifest, parseObjectListing } from "./object-manifest";

const agent = "workspaces/Personal/Bob";

test("a link inside its agent folder may sync", () => {
  for (const [rel, target] of [
    [`${agent}/web/node_modules/.bin/tsc`, "../typescript/bin/tsc"],
    [`${agent}/web/node_modules/react`, ".pnpm/react@19/node_modules/react"],
    [`${agent}/.claude/skills`, "../.agents/skills"],
    [`${agent}/tools/run`, "run.sh"],
  ]) {
    expect(linkTargetProblem(rel as string, target as string), rel).toBeNull();
  }
});

test("a link that leaves its agent folder or reaches Houston's own is refused", () => {
  for (const [rel, target] of [
    [`${agent}/.venv/bin/python`, "/usr/bin/python3"],
    [`${agent}/up`, "../Alice/notes.md"],
    [`${agent}/self`, "."],
    [`${agent}/deep/up`, "../../../../data/auth.json"],
    [`${agent}/state`, ".houston/browser/state.json"],
    [`${agent}/.houston/link`, "../notes.md"],
    [`${agent}/x`, "a\\b"],
    [`${agent}/x`, ""],
    [`${agent}/x`, "a\0b"],
    [`${agent}/x`, "a".repeat(4097)],
    ["data/link", "auth.json"],
    ["workspaces/Personal/link", "Bob/notes.md"],
  ]) {
    expect(
      linkTargetProblem(rel as string, target as string),
      rel,
    ).not.toBeNull();
  }
});

const listed = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  size: 3,
  md5: "m",
  updated: "2026-11-22T00:00:00Z",
  gen: 7,
  ...extra,
});

test("a listing with links merges them and says the store keeps attributes", () => {
  const { objects, fileAttrs } = parseObjectListing(
    {
      objects: [listed("a/run.sh", { exec: true }), listed("a/notes.md")],
      links: [listed("a/latest", { target: "notes.md" })],
    },
    "test",
  );
  expect(fileAttrs).toBe(true);
  const shaped = (key: string) => ({
    key,
    size: 3,
    md5: "m",
    updated: "2026-11-22T00:00:00Z",
    generation: "7",
  });
  expect(objects).toEqual([
    { ...shaped("a/run.sh"), executable: true },
    shaped("a/notes.md"),
    { ...shaped("a/latest"), link: "notes.md" },
  ]);
});

test("a listing without links is an older store: no attributes", () => {
  const { objects, fileAttrs } = parseObjectListing(
    { objects: [listed("a/run.sh")] },
    "test",
  );
  expect(fileAttrs).toBe(false);
  expect(objects[0]?.link).toBeUndefined();
});

test("a malformed link entry fails the listing", () => {
  expect(() =>
    parseObjectListing({ objects: [], links: [listed("a/x")] }, "test"),
  ).toThrow("malformed");
  expect(() => parseObjectListing({ objects: [], links: {} }, "test")).toThrow(
    "malformed",
  );
});

test("a one-level listing carries links too", () => {
  expect(
    parseDirManifest(
      { objects: [], dirs: ["a/b/"], links: [listed("a/l", { target: "b" })] },
      "test",
    ),
  ).toEqual({
    objects: [
      {
        key: "a/l",
        size: 3,
        md5: "m",
        updated: "2026-11-22T00:00:00Z",
        generation: "7",
        link: "b",
      },
    ],
    dirs: ["a/b"],
    fileAttrs: true,
  });
});
