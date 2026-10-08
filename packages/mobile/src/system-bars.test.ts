import { SystemBarsStyle } from "@capacitor/core";
import { expect, test } from "vitest";
import { systemBarStyleForTheme } from "./system-bars";

test("system bar glyphs follow the document theme", () => {
  expect(systemBarStyleForTheme(false)).toBe(SystemBarsStyle.Light);
  expect(systemBarStyleForTheme(true)).toBe(SystemBarsStyle.Dark);
});
