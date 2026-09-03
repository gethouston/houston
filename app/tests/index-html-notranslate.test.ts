import { match } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Both shells serve the same document, and both must opt out of browser page
// translation: the translator's <font> wrappers crash React's commit
// (HOUSTON-APP-590/55V/5CA). A regression here is a whole-screen loss on
// every translated phone, so the attribute and the meta are pinned.

const shells = {
  desktop: "../index.html",
  web: "../../packages/web/index.html",
};

describe("index.html opts out of browser translation", () => {
  for (const [shell, relative] of Object.entries(shells)) {
    it(`${shell} shell`, () => {
      const html = readFileSync(
        fileURLToPath(new URL(relative, import.meta.url)),
        "utf8",
      );
      match(html, /<html[^>]*\stranslate="no"[^>]*>/);
      match(html, /<meta name="google" content="notranslate" \/>/);
    });
  }
});
