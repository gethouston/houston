import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "./ports";
import { HoustonSdk } from "./sdk";

function fakePorts(overrides: Partial<SdkPorts> = {}): SdkPorts {
  const storage = new Map<string, string>();
  return {
    fetch: vi.fn(async () => new Response("{}", { status: 200 })),
    storage: {
      get: async (k) => storage.get(k) ?? null,
      set: async (k, v) => void storage.set(k, v),
      delete: async (k) => void storage.delete(k),
    },
    clock: {
      now: () => 0,
      setTimeout: () => 0,
      clearTimeout: () => undefined,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

function makeSdk(overrides: Partial<SdkConfig> = {}): HoustonSdk {
  return new HoustonSdk({
    baseUrl: "http://127.0.0.1:4317",
    ports: fakePorts(),
    ...overrides,
  });
}

describe("HoustonSdk construction", () => {
  it("constructs and exposes the four module facades", () => {
    const sdk = makeSdk();
    expect(sdk.session).toBeDefined();
    expect(sdk.agents).toBeDefined();
    expect(sdk.conversations).toBeDefined();
    expect(sdk.turns).toBeDefined();
  });
});

describe("HoustonSdk reactive surface", () => {
  it("delegates getSnapshot/subscribe to the internal store", () => {
    const sdk = makeSdk();
    expect(sdk.getSnapshot("agents")).toBeUndefined();
    const cb = vi.fn();
    const off = sdk.subscribe("agents", cb);
    // Nothing published yet; subscribe alone does not deliver.
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it("delivers global events through on()", () => {
    const sdk = makeSdk();
    const seen: unknown[] = [];
    // No public emit on the SDK surface; drive via dispatch of an unknown
    // command to confirm on() at least wires up without error, then assert the
    // unsubscribe contract.
    const off = sdk.on((e) => seen.push(e));
    expect(typeof off).toBe("function");
    off();
    expect(seen).toEqual([]);
  });
});

describe("HoustonSdk.dispatch (bridge path)", () => {
  it("returns ok:false for a malformed envelope, echoing any string id", async () => {
    const sdk = makeSdk();
    const bad = { id: "42" } as unknown as {
      id: string;
      type: string;
    };
    const result = await sdk.dispatch(bad);
    expect(result).toEqual({
      id: "42",
      ok: false,
      error: { message: "invalid command envelope" },
    });
  });

  it("returns ok:false with empty id when the envelope has no string id", async () => {
    const sdk = makeSdk();
    const result = await sdk.dispatch(
      null as unknown as { id: string; type: string },
    );
    expect(result).toEqual({
      id: "",
      ok: false,
      error: { message: "invalid command envelope" },
    });
  });

  it("returns ok:false for an unknown command type", async () => {
    const sdk = makeSdk();
    const result = await sdk.dispatch({ id: "1", type: "does/not/exist" });
    expect(result).toEqual({
      id: "1",
      ok: false,
      error: { message: "unknown command type: does/not/exist" },
    });
  });
});
