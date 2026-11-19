import { afterEach, describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() => vi.fn());
vi.mock("./launch", () => ({ launchBrowser: launch }));

import { browserAvailable } from "./browser.test-support";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("browser availability probe", () => {
  it("closes a working browser and enables the suite", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    launch.mockResolvedValue({ close });
    expect(await browserAvailable()).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it("allows a local machine without a browser to skip", async () => {
    vi.stubEnv("CI", undefined);
    launch.mockRejectedValue(new Error("browser unavailable"));
    expect(await browserAvailable()).toBe(false);
  });

  it("fails CI with the original launch error", async () => {
    vi.stubEnv("CI", "true");
    const error = new Error("browser launch failed");
    launch.mockRejectedValue(error);
    await expect(browserAvailable()).rejects.toBe(error);
  });

  it("fails CI when closing the probe browser fails", async () => {
    vi.stubEnv("CI", "true");
    const error = new Error("browser close failed");
    launch.mockResolvedValue({ close: vi.fn().mockRejectedValue(error) });
    await expect(browserAvailable()).rejects.toBe(error);
  });
});
