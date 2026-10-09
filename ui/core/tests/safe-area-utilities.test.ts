import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Each safe-area utility reads Capacitor's `--safe-area-inset-*` first (set
 * only on Android WebViews whose env() is wrong edge to edge), then env()
 * (iOS, current Android, notched browsers), then 0 (desktop). Dropping either
 * fallback puts the app's chrome under the status bar or home indicator on
 * one platform.
 */
const globalsCss = readFileSync(
  join(import.meta.dirname, "../src/globals.css"),
  "utf8",
);

const UTILITIES = [
  ["pt-safe", "padding-top", "top"],
  ["pb-safe", "padding-bottom", "bottom"],
  ["pl-safe", "padding-left", "left"],
  ["pr-safe", "padding-right", "right"],
] as const;

for (const [utility, property, edge] of UTILITIES) {
  test(`${utility} falls back from the Capacitor var to env() to 0`, () => {
    const block = globalsCss.match(
      new RegExp(`@utility ${utility} \\{([^}]*)\\}`),
    );
    assert.ok(block, `globals.css declares ${utility}`);
    assert.equal(
      block[1].trim(),
      `${property}: var(--safe-area-inset-${edge}, env(safe-area-inset-${edge}, 0px));`,
    );
  });
}
