import { expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const key = "last_workspace_id";
const team = "org:aaaaaaaaaaaaaaaa";
const spaces = [
  { id: "default", isDefault: true },
  { id: team, isDefault: false },
];
function setup(device: Map<string, string>, answer: typeof fetch) {
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
it("remembers a deliberate choice even when its account PUT is refused", async () => {
  const device = new Map<string, string>();
  const sdk = setup(device, async (_input, init) =>
    init?.method === "PUT"
      ? Response.json({ error: "needs_upgrade" }, { status: 403 })
      : Promise.reject(new TypeError("Failed to fetch")),
  );
  await expect(sdk.preferences.set(key, team)).rejects.toThrow();
  expect(await sdk.preferences.resolveWorkspace(spaces)).toEqual(spaces[1]);
});
it("remembers an automatic selection without writing the account", async () => {
  const answer = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  const sdk = setup(new Map(), answer);
  await sdk.preferences.rememberWorkspace(team);
  expect(answer).not.toHaveBeenCalled();
  expect(await sdk.preferences.resolveWorkspace(spaces)).toEqual(spaces[1]);
});
it("a refused PUT keeps this device's choice over the older account after reload", async () => {
  const device = new Map<string, string>();
  const answer: typeof fetch = async (_input, init) =>
    init?.method === "PUT"
      ? Response.json({ error: "needs_upgrade" }, { status: 403 })
      : Response.json({ value: "default" });
  await expect(
    setup(device, answer).preferences.set(key, team),
  ).rejects.toThrow();
  const spaces = [
    { id: "default", isDefault: true },
    { id: team, isDefault: false },
  ];
  const reloaded = setup(device, answer);
  expect(await reloaded.preferences.resolveWorkspace(spaces)).toEqual(
    spaces[1],
  );
  expect(
    await setup(device, answer).preferences.resolveWorkspace(spaces),
  ).toEqual(spaces[1]);
});
it("moves a legacy team to the device once without writing the account", async () => {
  const device = new Map([[key, team]]);
  const answer = vi.fn(async () => Response.json({ value: null }));
  expect(
    await setup(device, answer).preferences.resolveWorkspace(spaces),
  ).toEqual(spaces[1]);
  expect(
    await setup(device, answer).preferences.resolveWorkspace(spaces),
  ).toEqual(spaces[1]);
  expect(device.has(key)).toBe(false);
  expect(answer.mock.calls).toHaveLength(2);
});
