import { describe, expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { WORKSPACE_SELECTION_KEY as key } from "./workspace-selection";

const team = "org:aaaaaaaaaaaaaaaa";
const json = (body: unknown, status = 200) => Response.json(body, { status });

function makeSdk(answer: typeof fetch, device = new Map<string, string>()) {
  return new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: answer,
      storage: memoryKv(),
      devicePreferences: memoryKv(device),
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
}

describe("the SDK's workspace selection preference", () => {
  it("keeps an unset account distinct from a failed account read", async () => {
    const spaces = [{ id: team, isDefault: false }];
    const unset = makeSdk(async () => json({ value: null }));
    expect(await unset.preferences.resolveWorkspace(spaces)).toEqual(spaces[0]);
    const device = new Map([[key, team]]);
    const unavailable = makeSdk(async () => {
      throw new TypeError("Failed to fetch");
    }, device);
    expect(await unavailable.preferences.resolveWorkspace(spaces)).toEqual(
      spaces[0],
    );
    expect(device.has(key)).toBe(false);
  });
  it("orders direct SDK writes and continues after a rejected switch", async () => {
    const pending: Array<() => void> = [];
    const sdk = makeSdk(
      (_input, init) =>
        new Promise<Response>((resolve) => {
          pending.push(() =>
            resolve(
              init?.body === JSON.stringify({ value: team })
                ? json({ error: "denied" }, 403)
                : json({ value: "default" }),
            ),
          );
        }),
    );
    const first = expect(sdk.preferences.set(key, team)).rejects.toThrow();
    const last = sdk.preferences.set(key, "default");
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending.shift()?.();
    await first;
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending.shift()?.();
    expect(await last).toBe("default");
  });
});
