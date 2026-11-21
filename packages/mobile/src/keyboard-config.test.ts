import { expect, test } from "vitest";
import config from "../capacitor.config";

test("the keyboard resizes natively with no resizeOnFullScreen", () => {
  expect(config.plugins?.Keyboard).toEqual({ resize: "native" });
  expect(config.plugins?.SystemBars).toMatchObject({ insetsHandling: "css" });
});
