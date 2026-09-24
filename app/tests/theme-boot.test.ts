import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  DEFAULT_PALETTE,
  paletteSwatch,
  type ResolvedTheme,
  type ThemePreference,
} from "@houston/sdk/appearance";
import {
  applyBootTheme,
  applyThemeAttribute,
  readCachedTheme,
  startSystemThemeSync,
  systemPrefersDark,
  watchSystemTheme,
  writeCachedTheme,
} from "../src/lib/theme-boot.ts";

const KEY = "houston.theme.cache";

const HOUSTON_DARK: ResolvedTheme = {
  mode: "dark",
  palette: DEFAULT_PALETTE.dark,
};
const HOUSTON_LIGHT: ResolvedTheme = {
  mode: "light",
  palette: DEFAULT_PALETTE.light,
};
/** A non-Houston palette: it proves the palette, not the mode, picks the hexes. */
const NORD: ResolvedTheme = { mode: "dark", palette: "nord" };

// A hermetic in-memory `localStorage`. theme-boot reads `globalThis.localStorage`
// lazily at call time, so installing a fake before any call exercises the real
// mirror path. `throwOn` simulates a disabled / quota-full store.
class FakeLocalStorage {
  store = new Map<string, string>();
  throwOn: "get" | "set" | null = null;
  getItem(key: string): string | null {
    if (this.throwOn === "get") throw new Error("storage disabled");
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOn === "set") throw new Error("quota exceeded");
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** Just enough of an element to observe attributes and the inline background. */
class FakeElement {
  attrs = new Map<string, string>();
  style = { background: "" };
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
}

/** A `matchMedia` stand-in whose `change` event the test fires by hand. */
class FakeMediaQueryList {
  listeners = new Set<(event: { matches: boolean }) => void>();
  constructor(public matches: boolean) {}
  addEventListener(
    _type: "change",
    listener: (event: { matches: boolean }) => void,
  ): void {
    this.listeners.add(listener);
  }
  removeEventListener(
    _type: "change",
    listener: (event: { matches: boolean }) => void,
  ): void {
    this.listeners.delete(listener);
  }
  flip(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

function installMatchMedia(matches: boolean): FakeMediaQueryList {
  const query = new FakeMediaQueryList(matches);
  globalThis.matchMedia = ((requested: string) => {
    assert.equal(requested, "(prefers-color-scheme: dark)");
    return query;
  }) as unknown as typeof globalThis.matchMedia;
  return query;
}

let fake: FakeLocalStorage;
let root: FakeElement;
let themeColorMeta: FakeElement;
beforeEach(() => {
  fake = new FakeLocalStorage();
  globalThis.localStorage = fake as unknown as Storage;
  root = new FakeElement();
  themeColorMeta = new FakeElement();
  globalThis.document = {
    documentElement: root,
    // theme-boot only ever looks up the theme-color meta (shipped in
    // index.html); anything else resolving to null matches a real document.
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? themeColorMeta : null,
  } as unknown as Document;
});
afterEach(() => {
  // @ts-expect-error — tear down the fakes between tests.
  globalThis.localStorage = undefined;
  // @ts-expect-error — tear down the fakes between tests.
  globalThis.document = undefined;
  // @ts-expect-error — tear down the fakes between tests.
  globalThis.matchMedia = undefined;
});

test("dark sets data-theme, light removes it", () => {
  applyThemeAttribute(HOUSTON_DARK);
  assert.equal(root.attrs.get("data-theme"), "dark");
  applyThemeAttribute(HOUSTON_LIGHT);
  assert.equal(root.attrs.has("data-theme"), false);
});

test("the palette is always on the document, Houston's ids included", () => {
  applyThemeAttribute(HOUSTON_LIGHT);
  assert.equal(root.attrs.get("data-palette"), DEFAULT_PALETTE.light);
  applyThemeAttribute(NORD);
  assert.equal(root.attrs.get("data-palette"), "nord");
});

test("the inline background tracks the palette's own gutter", () => {
  applyThemeAttribute(NORD);
  assert.equal(root.style.background, paletteSwatch("nord").base);
  applyThemeAttribute(HOUSTON_LIGHT);
  assert.equal(
    root.style.background,
    paletteSwatch(DEFAULT_PALETTE.light).base,
  );
});

test("the theme-color meta tracks the applied palette's frame surface", () => {
  applyThemeAttribute(HOUSTON_DARK);
  assert.equal(
    themeColorMeta.attrs.get("content"),
    paletteSwatch(DEFAULT_PALETTE.dark).base,
  );
  applyThemeAttribute(HOUSTON_LIGHT);
  assert.equal(
    themeColorMeta.attrs.get("content"),
    paletteSwatch(DEFAULT_PALETTE.light).background,
  );
});

test("a document without the theme-color meta still themes cleanly", () => {
  (
    globalThis.document as { querySelector: (s: string) => null }
  ).querySelector = () => null;
  assert.doesNotThrow(() => applyThemeAttribute(HOUSTON_DARK));
  assert.equal(root.attrs.get("data-theme"), "dark");
});

test("the mirror round-trips mode and palette through storage", () => {
  writeCachedTheme(NORD);
  assert.deepEqual(JSON.parse(fake.store.get(KEY) ?? "null"), {
    mode: "dark",
    palette: "nord",
    base: paletteSwatch("nord").base,
    screen: paletteSwatch("nord").background,
  });
  assert.deepEqual(readCachedTheme(), NORD);
  writeCachedTheme(HOUSTON_LIGHT);
  assert.deepEqual(readCachedTheme(), HOUSTON_LIGHT);
});

test("no mirror yet reads as null", () => {
  assert.equal(readCachedTheme(), null);
});

test("a junk mirror value is discarded", () => {
  fake.store.set(KEY, "solarized");
  assert.equal(readCachedTheme(), null);
});

test("the legacy bare-mode mirror still paints, then gets rewritten", () => {
  fake.store.set(KEY, "dark");
  assert.deepEqual(readCachedTheme(), HOUSTON_DARK);
  writeCachedTheme(HOUSTON_DARK);
  assert.deepEqual(JSON.parse(fake.store.get(KEY) ?? "null").mode, "dark");
});

test("boot applies the mirrored dark theme before any engine read", () => {
  writeCachedTheme(NORD);
  assert.deepEqual(applyBootTheme(), NORD);
  assert.equal(root.attrs.get("data-theme"), "dark");
  assert.equal(root.attrs.get("data-palette"), "nord");
});

test("boot leaves the light default in place when the mirror says light", () => {
  writeCachedTheme(HOUSTON_LIGHT);
  assert.deepEqual(applyBootTheme(), HOUSTON_LIGHT);
  assert.equal(root.attrs.has("data-theme"), false);
});

test("boot is a no-op on a first launch, leaving the light default", () => {
  assert.equal(applyBootTheme(), null);
  assert.equal(root.attrs.has("data-theme"), false);
  assert.equal(root.attrs.has("data-palette"), false);
});

test("unavailable storage degrades to no mirror instead of throwing", () => {
  fake.throwOn = "get";
  assert.equal(readCachedTheme(), null);
  assert.equal(applyBootTheme(), null);
  assert.equal(root.attrs.has("data-theme"), false);
  fake.throwOn = "set";
  assert.doesNotThrow(() => writeCachedTheme(HOUSTON_DARK));
});

test("the OS appearance reads false where matchMedia does not exist", () => {
  assert.equal(systemPrefersDark(), false);
  assert.doesNotThrow(() => watchSystemTheme(() => {})());
});

test("the OS appearance is read from the dark colour-scheme query", () => {
  installMatchMedia(true);
  assert.equal(systemPrefersDark(), true);
  installMatchMedia(false);
  assert.equal(systemPrefersDark(), false);
});

test("the watcher reports changes and stops on unsubscribe", () => {
  const query = installMatchMedia(false);
  const seen: boolean[] = [];
  const stop = watchSystemTheme((prefersDark) => seen.push(prefersDark));
  query.flip(true);
  query.flip(false);
  stop();
  query.flip(true);
  assert.deepEqual(seen, [true, false]);
});

test("an OS change re-applies only while the preference follows the system", () => {
  const query = installMatchMedia(false);
  let preference: ThemePreference = {
    mode: "light",
    light: DEFAULT_PALETTE.light,
    dark: "nord",
  };
  const applied: ThemePreference[] = [];
  startSystemThemeSync(
    () => preference,
    (pref) => applied.push(pref),
  );
  query.flip(true);
  assert.deepEqual(applied, [], "an explicit choice ignores the OS");
  preference = { ...preference, mode: "system" };
  query.flip(false);
  assert.deepEqual(applied, [preference]);
});
