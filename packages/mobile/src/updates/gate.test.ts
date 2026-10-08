// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { showNativeUpdateGate } from "./gate";

test("required-update gate without a store URL offers retry", () => {
  document.body.innerHTML = '<div id="root"></div>';
  const retry = vi.fn();
  showNativeUpdateGate("", retry);
  const buttons = document.querySelectorAll("main button");
  expect(buttons).toHaveLength(1);
  buttons[0]?.click();
  expect(retry).toHaveBeenCalledOnce();
  expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
});
