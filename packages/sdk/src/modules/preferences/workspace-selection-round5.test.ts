import { afterEach, expect, it, vi } from "vitest";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const personal = { id: "default", isDefault: true };
const team = { id: "org:aaaaaaaaaaaaaaaa", isDefault: false };
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  let user = "A";
  const device = new Map<string, string>();
  const report = vi.fn();
  const answer = vi.fn<typeof fetch>();
  const sdk = new HoustonSdk({
    baseUrl: "http://host",
    reactivity: false,
    ports: {
      fetch: answer,
      storage: memoryKv(),
      devicePreferences: memoryKv(device),
      userId: () => user,
      reportPreferenceError: report,
      clock: {
        now: Date.now,
        setTimeout: (fn, ms) => Number(setTimeout(fn, ms)),
        clearTimeout,
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  });
  return {
    sdk,
    answer,
    device,
    report,
    changeUser: () => {
      user = "B";
    },
  };
}

it.each([
  "403",
  "timeout",
  "success",
])("discards an obsolete account %s resolution", async (outcome) => {
  const h = setup();
  let finish: ((response: Response) => void) | undefined;
  h.answer.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await h.sdk.preferences.rememberWorkspace(team.id);
  const boot = h.sdk.preferences
    .resolveWorkspace([personal, team])
    .catch((error) => error);
  await vi.advanceTimersByTimeAsync(0);
  h.changeUser();
  if (outcome === "timeout") await vi.advanceTimersByTimeAsync(10_000);
  else
    finish?.(
      outcome === "403"
        ? Response.json({ error: "denied" }, { status: 403 })
        : Response.json({ value: team.id }),
    );
  expect(await boot).toMatchObject({
    name: "WorkspacePreferenceIdentityChanged",
  });
  expect(h.report).not.toHaveBeenCalled();
});

it("starts the account read before the list resolves", async () => {
  const h = setup();
  h.answer.mockResolvedValue(Response.json({ value: team.id }));
  let finishList: ((spaces: (typeof personal)[]) => void) | undefined;
  const list = new Promise<(typeof personal)[]>((resolve) => {
    finishList = resolve;
  });
  const boot = h.sdk.preferences.resolveWorkspace(list);
  await vi.advanceTimersByTimeAsync(0);
  const requestsBeforeList = h.answer.mock.calls.length;
  finishList?.([personal, team]);
  expect(await boot).toEqual(team);
  expect(requestsBeforeList).toBe(1);
});

it("a personal-only list never waits for the account and records the displayed space", async () => {
  const h = setup();
  h.answer.mockImplementation(() => new Promise(() => {}));
  let shown: unknown;
  const boot = h.sdk.preferences.resolveWorkspace([personal]).then((value) => {
    shown = value;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(shown).toEqual(personal);
  expect(
    [...h.device.values()].map((value) => JSON.parse(value)),
  ).toContainEqual({
    value: personal.id,
    accountWriteSucceeded: true,
  });
  await vi.advanceTimersByTimeAsync(10_000);
  await boot;
  expect(h.report).not.toHaveBeenCalled();
});
