// @vitest-environment jsdom
import { App } from "@capacitor/app";
import { logAndReportError } from "@houston/app/lib/error-report";
import { expect, test, vi } from "vitest";
import { installUpdates } from "./boot";
import type { UpdatePorts } from "./manager";

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: vi
      .fn()
      .mockRejectedValueOnce(new Error("native info failed"))
      .mockResolvedValue({ build: "2" }),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));
vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    getFailedUpdate: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: vi.fn(),
}));
vi.mock("./manager", () => ({
  createUpdateManager: vi.fn(
    (_config: unknown, ports: UpdatePorts) => async () => {
      try {
        await ports.nativeBuild();
      } catch (error) {
        ports.report(error);
      }
    },
  ),
}));

test("native info failure does not prevent the resume listener from registering", async () => {
  vi.stubGlobal("__HOUSTON_MOBILE_UPDATE_BASE_URL__", "https://updates.test");
  vi.stubGlobal("__HOUSTON_MOBILE_UPDATE_PUBKEY__", "key");
  vi.stubGlobal("__HOUSTON_MOBILE_DEPLOY_ENV__", "preview");
  vi.stubGlobal("__HOUSTON_MOBILE_BUNDLE_VERSION__", "1");
  vi.stubGlobal("__HOUSTON_MOBILE_BUILTIN_SEQUENCE__", 1);
  await installUpdates();
  expect(App.addListener).toHaveBeenCalledWith(
    "appStateChange",
    expect.any(Function),
  );
  await vi.waitFor(() => expect(logAndReportError).toHaveBeenCalledOnce());
  const listener = vi.mocked(App.addListener).mock.calls[0]?.[1] as (state: {
    isActive: boolean;
  }) => void;
  listener({ isActive: true });
  await vi.waitFor(() => expect(App.getInfo).toHaveBeenCalledTimes(2));
});
