import { expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const key = "last_workspace_id";
const personal = { id: "default", isDefault: true };
const first = { id: "org:aaaaaaaaaaaaaaaa", isDefault: false };
const second = { id: "org:bbbbbbbbbbbbbbbb", isDefault: false };
const spaces = [personal, first, second];

function setup(device = new Map<string, string>()) {
  let account: string | null = null;
  let failure = false;
  let user = "person";
  const answer = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (failure) throw new TypeError("Failed to fetch");
      if (init?.method === "PUT") account = JSON.parse(String(init.body)).value;
      return Response.json({ value: account });
    },
  );
  const make = () =>
    new HoustonSdk({
      baseUrl: "http://host",
      reactivity: false,
      ports: {
        fetch: answer,
        storage: memoryKv(),
        devicePreferences: memoryKv(device),
        userId: () => user,
        clock: { now: Date.now, setTimeout: () => 0, clearTimeout: () => {} },
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
    });
  return {
    make,
    answer,
    remote: (value: string | null) => {
      account = value;
    },
    offline: (value: boolean) => {
      failure = value;
    },
    user: (value: string) => {
      user = value;
    },
  };
}

it.each([
  { account: personal.id, device: second.id, expected: personal },
  { account: "removed", device: second.id, expected: second },
  { account: null, device: "removed", expected: first },
  { account: null, device: null, expected: first },
])("resolves accessible account $account then device $device", async ({
  account,
  device,
  expected,
}) => {
  const h = setup();
  h.remote(account);
  if (device) await h.make().preferences.rememberWorkspace(device);
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(expected);
  expect(h.answer).toHaveBeenCalledTimes(1);
});

it("a failed account read uses this device, and a different account gets the first team", async () => {
  const h = setup();
  await h.make().preferences.rememberWorkspace(second.id);
  h.offline(true);
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(second);
  h.user("other-person");
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(first);
});

it("an unsuccessful choice survives reload without retrying, until a deliberate write succeeds", async () => {
  const h = setup();
  h.remote(personal.id);
  h.offline(true);
  await expect(h.make().preferences.set(key, second.id)).rejects.toThrow();
  h.offline(false);
  for (let boot = 0; boot < 2; boot++)
    expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(second);
  expect(
    h.answer.mock.calls.filter(([, init]) => init?.method === "PUT"),
  ).toHaveLength(1);
  await h.make().preferences.set(key, second.id);
  h.remote(personal.id);
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(personal);
});

it("automatic resolution records the displayed space for a later failed read", async () => {
  const h = setup();
  h.remote(second.id);
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(second);
  h.offline(true);
  expect(await h.make().preferences.resolveWorkspace(spaces)).toEqual(second);
});
