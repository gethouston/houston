// @vitest-environment jsdom
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { expect, test, vi } from "vitest";
import { notifyMobileReadyAfterRender } from "./ready";

vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: { notifyAppReady: vi.fn().mockResolvedValue(undefined) },
}));

test("first committed loading shell marks a healthy bundle ready", () => {
  document.body.innerHTML =
    '<div id="root"><div data-houston-boot-loading></div></div>';
  notifyMobileReadyAfterRender(vi.fn());
  expect(CapacitorUpdater.notifyAppReady).toHaveBeenCalledOnce();
});
