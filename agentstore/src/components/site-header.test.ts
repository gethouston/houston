import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The store follows the visitor's `prefers-color-scheme` (src/app/layout.tsx),
 * so every surface in the header is theme-reactive (`bg-gutter`, `bg-action`).
 * A `text-white` foreground on top of that is white on the light gutter — an
 * invisible header for a light visitor. Foregrounds pair with the surface by
 * token (`text-ink`, `text-ink-muted`, `border-line`, `bg-hover`) or they do not
 * pair at all.
 */
const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "site-header.tsx"),
  "utf8",
);

const WHITE_UTILITY = /(?:text|bg|border|fill|stroke|ring|divide)-white\b/g;

describe("site header", () => {
  it("wears no white-pinned foreground, so it survives the light theme", () => {
    expect(source.match(WHITE_UTILITY)).toBeNull();
  });

  it("pairs its ink with the tokens instead", () => {
    expect(source).toContain("text-ink");
    expect(source).toContain("text-ink-muted");
    expect(source).toContain("border-line");
  });
});
