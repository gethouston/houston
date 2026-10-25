import { afterEach, expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const key = "last_workspace_id";
const team = "org:aaaaaaaaaaaaaaaa";
afterEach(() => vi.useRealTimers());
function setup(answer: typeof fetch) {
  vi.useFakeTimers();
  return new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: answer,
      storage: memoryKv(),
      devicePreferences: memoryKv(
        new Map([
          [
            `${key}.device`,
            JSON.stringify({ value: team, accountWriteSucceeded: true }),
          ],
        ]),
      ),
      clock: {
        now: Date.now,
        setTimeout: (fn, ms) => Number(setTimeout(fn, ms)),
        clearTimeout,
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
}
it("bounds a hung boot read and preserves the device selection", async () => {
  let settled = false;
  let signal: AbortSignal | null | undefined;
  const sdk = setup((_input, init) => {
    signal = init?.signal;
    return new Promise(() => {});
  });
  const spaces = [{ id: team, isDefault: false }];
  const read = sdk.preferences.resolveWorkspace(spaces).then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(settled).toBe(true);
  expect(await read).toEqual(spaces[0]);
  expect(signal?.aborted).toBe(true);
});
it("a hung write times out and releases the next deliberate choice", async () => {
  let calls = 0;
  let settled = false;
  const sdk = setup(async () =>
    ++calls === 1 ? new Promise(() => {}) : Response.json({ value: "default" }),
  );
  const first = sdk.preferences.set(key, team).catch((error) => error);
  const last = sdk.preferences.set(key, "default").then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(settled).toBe(true);
  expect(await first).toBeInstanceOf(Error);
  expect(await last).toBe("default");
  expect(calls).toBe(2);
});

it("a four-second deliberate PUT succeeds", async () => {
  const sdk = setup(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(Response.json({ value: team })), 4000);
      }),
  );
  const result = sdk.preferences.set(key, team).catch((error) => error);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await result).toBe(team);
});
