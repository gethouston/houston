// @vitest-environment jsdom
import { expect, test } from "vitest";
import { showNativeUpdateGate } from "./gate";

test("required-update gate without a store URL offers retry", () => {
  document.body.innerHTML = '<div id="root"></div>';
  showNativeUpdateGate("");
  const buttons = document.querySelectorAll("main button");
  expect(buttons).toHaveLength(2);
  buttons[1]?.click();
  expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
});
