import assert, { match } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Both shells serve the same document, and this file pins the two ways they must
// not drift.
//
// Browser page translation: both must opt out, because the translator's <font>
// wrappers crash React's commit (HOUSTON-APP-590/55V/5CA). A regression here is a
// whole-screen loss on every translated phone, so the attribute and the meta are
// pinned.
//
// The pre-paint frame: the <style> fallback and the boot-mirror <script> are the
// FIRST frame the user sees, before any module runs, and both files carry them
// verbatim (each says "KEEP IDENTICAL" to the other). A fix landing in one shell
// only is a wrong-theme flash on the other, so the blocks are compared byte for
// byte.

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

/** The pre-paint boot-mirror script: the one that reads the mirror. */
function prePaintScript(html: string): string {
  const found = html.match(
    /<script>([\s\S]*?houston\.theme\.cache[\s\S]*?)<\/script>/,
  );
  assert.ok(found, "the pre-paint script is in the document");
  return found[1].trim();
}

/** The pre-JS frame's fallback CSS, which is the first <style> in the head. */
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
    // The meta ships in this same document, so a missing one means something
    // stripped it — a null then throws INSIDE the try and costs the whole
    // pre-paint frame, including the `data-theme` set two lines above. Same
    // null-safety as the TS twin (`applyThemeAttribute`), spelled in the
    // conservative ES2015 both shipped-as-authored scripts use (see
    // app/public/compat-gate.js).
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
