import { initialNavState } from "@houston/app/lib/nav-stack";
import { expect, test, vi } from "vitest";
import { handleHardwareBack } from "./back-button";

test("hardware back retreats through the app before minimizing", async () => {
  const state = initialNavState();
  const back = vi.fn();
  const minimize = vi.fn(async () => {});
  await handleHardwareBack({ state: () => state, back, minimize });
  expect(minimize).toHaveBeenCalledOnce();
  state.navStack.push(state.navStack[0]);
  state.navIndex = 1;
  await handleHardwareBack({ state: () => state, back, minimize });
  expect(back).toHaveBeenCalledOnce();
  expect(minimize).toHaveBeenCalledOnce();
});
