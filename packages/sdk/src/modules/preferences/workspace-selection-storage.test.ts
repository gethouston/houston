import { expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

it("reports blocked device storage through the surface dedupe and preserves successful account results", async () => {
  const reportPreferenceError = vi.fn();
  const blocked = async (): Promise<never> => {
    throw new Error("storage blocked");
  };
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: async () => Response.json({ value: "default" }),
      storage: memoryKv(),
      devicePreferences: { get: blocked, set: blocked, delete: blocked },
      clock: { now: Date.now, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      reportPreferenceError,
    },
  });
  expect(await sdk.preferences.get("last_workspace_id")).toBe("default");
  expect(await sdk.preferences.set("last_workspace_id", "default")).toBe(
    "default",
  );
  expect(reportPreferenceError).toHaveBeenCalledWith(
    "device",
    expect.any(Error),
  );
});
