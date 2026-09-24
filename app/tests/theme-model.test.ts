import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PALETTE, paletteSwatch } from "@houston/sdk/appearance";
import {
  parseThemeMirror,
  serializeThemeMirror,
} from "../src/lib/theme-model.ts";

/**
 * The boot mirror alone. The vocabulary it is written in — modes, palettes,
 * resolution, validation — belongs to the SDK's appearance module, and its rules
 * are pinned there (`packages/sdk/tests/appearance-model.test.ts`).
 *
 * What matters here is the WIRE form: the pre-paint script in both index.html
 * files reads this JSON before any module graph exists, so a shape it cannot read
 * is a flash of the wrong theme on every launch.
 */

test("the mirror round-trips the resolved theme and its first-frame hexes", () => {
  const resolved = { mode: "dark", palette: "nord" } as const;
  const raw = serializeThemeMirror(resolved);
  const swatch = paletteSwatch("nord");
  assert.deepEqual(JSON.parse(raw), {
    mode: "dark",
    palette: "nord",
    base: swatch.base,
    screen: swatch.background,
  });
  assert.deepEqual(parseThemeMirror(raw), resolved);
});

test("the legacy bare-mode mirror reads as Houston's palette", () => {
  assert.deepEqual(parseThemeMirror("dark"), {
    mode: "dark",
    palette: DEFAULT_PALETTE.dark,
  });
  assert.deepEqual(parseThemeMirror("light"), {
    mode: "light",
    palette: DEFAULT_PALETTE.light,
  });
});

test("an unusable mirror reads as no mirror", () => {
  assert.equal(parseThemeMirror(null), null);
  assert.equal(parseThemeMirror("{not json"), null);
  assert.equal(parseThemeMirror("42"), null);
  assert.equal(parseThemeMirror('{"palette":"nord"}'), null);
  assert.equal(parseThemeMirror('{"mode":"sepia","palette":"nord"}'), null);
});

test("a mirror naming an unknown palette keeps its mode on the default", () => {
  assert.deepEqual(parseThemeMirror('{"mode":"dark","palette":"nebula"}'), {
    mode: "dark",
    palette: DEFAULT_PALETTE.dark,
  });
  // A light palette under a dark mode is the same unusable pairing.
  assert.deepEqual(
    parseThemeMirror('{"mode":"dark","palette":"flexoki-light"}'),
    { mode: "dark", palette: DEFAULT_PALETTE.dark },
  );
});
