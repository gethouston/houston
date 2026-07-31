import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  applyBootTheme,
  applyThemeAttribute,
  readCachedTheme,
  writeCachedTheme,
} from "../src/lib/theme-boot.ts";

const KEY = "houston.theme.cache";

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

/** Just enough of `document.documentElement` to observe `data-theme`. */
class FakeElement {
  attrs = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
}

let fake: FakeLocalStorage;
let root: FakeElement;
beforeEach(() => {
  fake = new FakeLocalStorage();
  globalThis.localStorage = fake as unknown as Storage;
  root = new FakeElement();
  globalThis.document = { documentElement: root } as unknown as Document;
});
afterEach(() => {
  // @ts-expect-error — tear down the fakes between tests.
  globalThis.localStorage = undefined;
  // @ts-expect-error — tear down the fakes between tests.
  globalThis.document = undefined;
});

test("dark sets data-theme, light removes it", () => {
  applyThemeAttribute("dark");
  assert.equal(root.attrs.get("data-theme"), "dark");
  applyThemeAttribute("light");
  assert.equal(root.attrs.has("data-theme"), false);
});

test("the mirror round-trips both themes", () => {
  writeCachedTheme("dark");
  assert.equal(fake.store.get(KEY), "dark");
  assert.equal(readCachedTheme(), "dark");
  writeCachedTheme("light");
  assert.equal(readCachedTheme(), "light");
});

test("no mirror yet reads as null", () => {
  assert.equal(readCachedTheme(), null);
});

test("a junk mirror value is discarded", () => {
  fake.store.set(KEY, "solarized");
  assert.equal(readCachedTheme(), null);
});

test("boot applies the mirrored dark theme before any engine read", () => {
  writeCachedTheme("dark");
  assert.equal(applyBootTheme(), "dark");
  assert.equal(root.attrs.get("data-theme"), "dark");
});

test("boot leaves the light default in place when the mirror says light", () => {
  writeCachedTheme("light");
  assert.equal(applyBootTheme(), "light");
  assert.equal(root.attrs.has("data-theme"), false);
});

test("boot is a no-op on a first launch, leaving the light default", () => {
  assert.equal(applyBootTheme(), null);
  assert.equal(root.attrs.has("data-theme"), false);
});

test("unavailable storage degrades to no mirror instead of throwing", () => {
  fake.throwOn = "get";
  assert.equal(readCachedTheme(), null);
  assert.equal(applyBootTheme(), null);
  assert.equal(root.attrs.has("data-theme"), false);
  fake.throwOn = "set";
  assert.doesNotThrow(() => writeCachedTheme("dark"));
});
