import type { Page } from "playwright-core";
import { expect, test } from "vitest";
import {
  lookEpoch,
  MAX_REMEMBERED_REFS,
  previousRefs,
  rememberLook,
  supersedeLooks,
} from "./look-memory";
import type { BrowserTab } from "./open-tab";

const tab = () => ({}) as BrowserTab;
const page = () => ({}) as Page;

test("the previous look counts only for the same page and document", () => {
  const t = tab();
  const p = page();
  rememberLook(t, p, 100.5, new Set(["e1"]));
  expect(previousRefs(t, p, 100.5)).toEqual(new Set(["e1"]));
  expect(previousRefs(t, p, 200.5)).toBeUndefined();
  expect(previousRefs(t, page(), 100.5)).toBeUndefined();
  expect(previousRefs(tab(), p, 100.5)).toBeUndefined();
});

test("a page with too many elements is not remembered", () => {
  const t = tab();
  const p = page();
  rememberLook(t, p, 1, new Set(["e1"]));
  const huge = new Set(
    Array.from({ length: MAX_REMEMBERED_REFS + 1 }, (_, i) => `e${i}`),
  );
  rememberLook(t, p, 1, huge);
  expect(previousRefs(t, p, 1)).toBeUndefined();
});

test("a dialog supersedes the looks already under way", () => {
  const t = tab();
  const before = lookEpoch(t);
  supersedeLooks(t);
  expect(lookEpoch(t)).toBe(before + 1);
  expect(lookEpoch(tab())).toBe(0);
});
