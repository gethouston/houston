import assert, { match } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const shells = {
  desktop: "../index.html",
  web: "../../packages/web/index.html",
};

function read(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    "utf8",
  );
}

function prePaintScript(html: string): string {
  const found = html.match(
    /<script>([\s\S]*?houston\.theme\.cache[\s\S]*?)<\/script>/,
  );
  assert.ok(found, "the pre-paint script is in the document");
  return found[1].trim();
}

function prePaintStyle(html: string): string {
  const found = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(found, "the pre-JS frame's CSS is in the document");
  return found[1].trim();
}

describe("index.html opts out of browser translation", () => {
  for (const [shell, relative] of Object.entries(shells)) {
    it(`${shell} shell`, () => {
      const html = read(relative);
      match(html, /<html[^>]*\stranslate="no"[^>]*>/);
      match(html, /<meta name="google" content="notranslate" \/>/);
    });
  }
});

describe("the pre-paint frame is one document in two shells", () => {
  const desktop = read(shells.desktop);
  const web = read(shells.web);

  it("carries the same boot-mirror script in both", () => {
    const script = prePaintScript(desktop);
    match(script, /^try \{/);
    match(script, /\}$/);
    assert.strictEqual(script, prePaintScript(web));
  });

  it("carries the same fallback CSS in both", () => {
    assert.strictEqual(prePaintStyle(desktop), prePaintStyle(web));
  });

  it("writes the chrome colour only onto a meta that is there", () => {
    for (const html of [desktop, web]) {
      const script = prePaintScript(html);
      match(script, /var meta = document\.querySelector\(/);
      match(script, /if \(chrome && meta\)/);
      assert.doesNotMatch(
        script,
        /querySelector\([\s\S]*?\)\s*\.setAttribute/,
        "never call setAttribute straight off a query that can answer null",
      );
    }
  });
});
