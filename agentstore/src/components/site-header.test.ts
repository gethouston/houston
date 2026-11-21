import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    expect(source).toContain("border-line");
  });

  it("keeps the nav links readable on the light gutter", () => {
    expect(source).toContain("text-ink/70");
    expect(source).not.toContain("text-ink-muted");
  });
});
