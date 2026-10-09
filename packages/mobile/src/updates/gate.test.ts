// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { showNativeUpdateGate } from "./gate";

test("required-update gate without a store URL offers retry", () => {
  document.body.innerHTML = '<div id="root"></div>';
  const retry = vi.fn().mockResolvedValue("required");
  showNativeUpdateGate("", retry);
  const buttons = document.querySelectorAll("main button");
  expect(buttons).toHaveLength(1);
  buttons[0]?.click();
  expect(retry).toHaveBeenCalledOnce();
  expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
});

test("retry shows busy and a translated still-required status, then clears the gate", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  let resolveCheck: ((result: "required" | "clear") => void) | undefined;
  const check = vi.fn(
    () =>
      new Promise<"required" | "clear">((resolve) => {
        resolveCheck = resolve;
      }),
  );
  showNativeUpdateGate("https://store.test", check);
  const retry = document.querySelector<HTMLButtonElement>(
    "[data-houston-check-again]",
  );
  expect(retry).not.toBeNull();
  retry?.click();
  expect(retry?.getAttribute("aria-busy")).toBe("true");
  retry?.click();
  expect(check).toHaveBeenCalledOnce();
  resolveCheck?.("required");
  await vi.waitFor(() =>
    expect(retry?.getAttribute("aria-busy")).toBe("false"),
  );
  expect(document.querySelector("[role=status]")?.textContent).toBeTruthy();
  retry?.click();
  resolveCheck?.("clear");
  await vi.waitFor(() =>
    expect(document.querySelector("[data-houston-required-update]")).toBeNull(),
  );
  expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
  expect(document.getElementById("root")?.hasAttribute("aria-hidden")).toBe(
    false,
  );
});
