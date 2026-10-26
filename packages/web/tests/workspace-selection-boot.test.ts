import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  list: vi.fn(),
  pin: vi.fn(),
  track: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: mocks.report,
}));
vi.mock("@houston/app/lib/engine", () => ({
  setActiveOrg: mocks.pin,
  setPreferenceErrorReporter: () => {},
}));
vi.mock("@houston/app/lib/analytics", () => ({
  analytics: { track: mocks.track },
}));
vi.mock("@houston/app/lib/query-client", () => ({ queryClient: {} }));
vi.mock("@houston/app/lib/space-cache", () => ({
  resetCacheForSpaceChange: vi.fn(),
}));
vi.mock("@houston/app/lib/tauri", () => ({
  tauriWorkspaces: { list: mocks.list },
  tauriPreferences: { resolveWorkspace: mocks.resolve },
}));

import { reportWorkspacePreferenceError } from "@houston/app/lib/workspace-preference-error";
import { useWorkspaceStore } from "@houston/app/stores/workspaces";

const personal = {
  id: "default",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01",
};
const team = {
  ...personal,
  id: "org:00112233aabbccdd",
  name: "Team",
  isDefault: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  useWorkspaceStore.setState({
    workspaces: [],
    current: null,
    loading: true,
    loaded: false,
    loadError: false,
  });
  mocks.list.mockResolvedValue([personal, team]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([
  { legacy: null, account: null, failure: false, expected: team.id },
  { legacy: null, account: "removed", failure: false, expected: team.id },
  { legacy: null, account: personal.id, failure: false, expected: personal.id },
  { legacy: team.id, account: null, failure: true, expected: team.id },
  { legacy: null, account: null, failure: true, expected: team.id },
  { legacy: "default", account: null, failure: false, expected: team.id },
])("boot with $legacy, $account and failure $failure opens $expected without writes", async ({
  legacy,
  account,
  failure,
  expected,
}) => {
  const local = new Map<string, string>();
  if (legacy) local.set("houston.pref.last_workspace_id", legacy);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  const answer = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).has("x-houston-org")).toBe(false);
      if (failure) throw new TypeError("Failed to fetch");
      return Response.json({ value: account });
    },
  );
  vi.stubGlobal("fetch", answer);
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
    onPreferenceError: reportWorkspacePreferenceError,
  });
  client.setActiveOrg("00112233aabbccdd");
  mocks.resolve.mockImplementation((workspaces) =>
    client.resolveWorkspaceSelection(workspaces),
  );
  await useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().current?.id).toBe(expected);
  expect(useWorkspaceStore.getState().loadError).toBe(false);
  expect(mocks.pin).toHaveBeenCalledWith(
    expected === team.id ? "00112233aabbccdd" : null,
  );
  expect(local.has("houston.pref.last_workspace_id")).toBe(false);
  expect(mocks.report).not.toHaveBeenCalled();
});

test("a boot 503 retries and resolves without Sentry", async () => {
  vi.useFakeTimers();
  const answer = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "handoff" }, { status: 503 }))
    .mockResolvedValue(Response.json({ value: team.id }));
  vi.stubGlobal("fetch", answer);
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
    onPreferenceError: reportWorkspacePreferenceError,
  });
  mocks.resolve.mockImplementation((workspaces) =>
    client.resolveWorkspaceSelection(workspaces),
  );
  const boot = useWorkspaceStore.getState().loadWorkspaces();
  await vi.advanceTimersByTimeAsync(2000);
  await boot;
  expect(answer).toHaveBeenCalledTimes(2);
  expect(useWorkspaceStore.getState().current?.id).toBe(team.id);
  expect(mocks.report).not.toHaveBeenCalled();
});

test("blocked storage reports once while account reads and switches still succeed", async () => {
  const blocked = () => {
    throw new Error("storage blocked r4");
  };
  vi.stubGlobal("localStorage", {
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ value: team.id })),
  );
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
    onPreferenceError: reportWorkspacePreferenceError,
  });
  expect(await client.resolveWorkspaceSelection([personal, team])).toEqual(
    team,
  );
  await client.setPreference("last_workspace_id", team.id);
  expect(mocks.report).toHaveBeenCalledExactlyOnceWith(
    "workspace_preference_device",
    expect.any(Error),
  );
  expect(mocks.track).toHaveBeenCalledTimes(1);
});

test("a billing refusal from the real SDK is expected and boot still opens a team", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: "needs_upgrade" }, { status: 403 }),
    ),
  );
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
    onPreferenceError: reportWorkspacePreferenceError,
  });
  expect(await client.resolveWorkspaceSelection([personal, team])).toEqual(
    team,
  );
  expect(mocks.report).not.toHaveBeenCalled();
});
