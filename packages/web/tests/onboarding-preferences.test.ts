import { beforeEach, expect, test, vi } from "vitest";

const { cpGetPreference, cpSetPreference } = vi.hoisted(() => ({
  cpGetPreference: vi.fn(),
  cpSetPreference: vi.fn(),
}));

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    getPreference: cpGetPreference,
    setPreference: cpSetPreference,
  };
});

import { HoustonClient } from "../src/engine-adapter/client";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  cpGetPreference.mockReset();
  cpSetPreference.mockReset();
});

function hostedClient() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

test("hosted getPreference falls back to the control plane when local cache is empty", async () => {
  cpGetPreference.mockResolvedValue("business_owner");

  await expect(hostedClient().getPreference("segment")).resolves.toBe(
    "business_owner",
  );

  expect(cpGetPreference).toHaveBeenCalledWith(
    expect.objectContaining({ baseUrl: "http://host" }),
    "segment",
  );
});

test("hosted setPreference writes the control plane before caching locally", async () => {
  cpSetPreference.mockResolvedValue(undefined);

  await hostedClient().setPreference("segment", "operations");

  expect(cpSetPreference).toHaveBeenCalledWith(
    expect.objectContaining({ baseUrl: "http://host" }),
    "segment",
    "operations",
  );
  expect(store.get("houston.pref.segment")).toBe("operations");
});

test("hosted setPreference does not silently cache after a control-plane failure", async () => {
  cpSetPreference.mockRejectedValue(new Error("preference write failed"));

  await expect(
    hostedClient().setPreference("segment", "operations"),
  ).rejects.toThrow("preference write failed");

  expect(store.has("houston.pref.segment")).toBe(false);
});
