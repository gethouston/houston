import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const webIcon = read("../public/favicon.svg");
const link = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';

describe("favicon", () => {
  test("every web app document links the SVG icon", () => {
    expect(read("../index.html")).toContain(link);
    expect(read("../connected/index.html")).toContain(link);
  });

  test("turns white under a dark browser theme", () => {
    expect(webIcon).toContain("path,rect{fill:#0d0d0d}");
    expect(webIcon).toContain(
      "@media (prefers-color-scheme:dark){path,rect{fill:#fff}}",
    );
    expect(webIcon).not.toContain("style=");
  });

  test("the website and the Agent Store ship the same file", () => {
    expect(read("../../../website/src/favicon.svg")).toBe(webIcon);
    expect(read("../../../agentstore/src/app/icon.svg")).toBe(webIcon);
  });
});
