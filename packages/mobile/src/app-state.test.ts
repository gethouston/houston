import { expect, test, vi } from "vitest";
import { applyNativeAppState } from "./app-state";

test("resume restores focus and online state for query refetch", () => {
  const online = vi.fn();
  const focused = vi.fn();
  applyNativeAppState(false, false, { online, focused });
  expect(online).not.toHaveBeenCalled();
  expect(focused).toHaveBeenLastCalledWith(false);
  applyNativeAppState(true, true, { online, focused });
  expect(online).toHaveBeenLastCalledWith(true);
  expect(focused).toHaveBeenLastCalledWith(true);
});
