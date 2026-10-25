import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  resolve: vi.fn(),
  set: vi.fn(),
  pin: vi.fn(),
  resetCache: vi.fn(),
}));
vi.mock("@houston/app/lib/engine", () => ({ setActiveOrg: mocks.pin }));
vi.mock("@houston/app/lib/analytics", () => ({
  analytics: { track: vi.fn() },
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: vi.fn(),
}));
vi.mock("@houston/app/lib/query-client", () => ({ queryClient: {} }));
vi.mock("@houston/app/lib/assistant-address-cache", () => ({
  forgetAssistantAddresses: vi.fn(),
}));
vi.mock("@houston/app/lib/space-cache", () => ({
  resetCacheForSpaceChange: mocks.resetCache,
}));
vi.mock("@houston/app/lib/tauri", () => ({
  tauriWorkspaces: { list: mocks.list },
  tauriPreferences: {
    resolveWorkspace: mocks.resolve,
    set: mocks.set,
    rememberWorkspace: vi.fn(async () => {}),
  },
}));

import { useWorkspaceStore } from "@houston/app/stores/workspaces";

const personal = {
  id: "default",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01",
};
const first = { ...personal, id: "org:aaaaaaaaaaaaaaaa", isDefault: false };
const second = { ...first, id: "org:bbbbbbbbbbbbbbbb" };
const spaces = [personal, first, second];
beforeEach(() => {
  vi.resetAllMocks();
  useWorkspaceStore.getState().reset();
  mocks.set.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

test("reloading memberships preserves the displayed space without resolving the account", async () => {
  useWorkspaceStore.setState({
    workspaces: spaces,
    current: second,
    loaded: true,
  });
  const renamed = { ...second, name: "Renamed team" };
  mocks.list.mockResolvedValue([personal, first, renamed]);
  mocks.resolve.mockResolvedValue(first);
  await useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().current?.id).toBe(second.id);
  expect(useWorkspaceStore.getState().current?.name).toBe("Renamed team");
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.pin).not.toHaveBeenCalled();
});

test.each([
  false,
  true,
])("a switch during reload survives its failed PUT: %s", async (refused) => {
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  const answer = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "PUT" && refused
      ? Response.json({ error: "needs_upgrade" }, { status: 403 })
      : Response.json({ value: first.id }),
  );
  vi.stubGlobal("fetch", answer);
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  let write: Promise<unknown> | undefined;
  mocks.set.mockImplementation((key, value) => {
    const pending = client.setPreference(key, value);
    write = pending.catch((error) => error);
    return pending;
  });
  mocks.resolve.mockImplementation((workspaces) =>
    client.resolveWorkspaceSelection(workspaces),
  );
  let finishList: ((value: typeof spaces) => void) | undefined;
  mocks.list.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishList = resolve;
      }),
  );
  useWorkspaceStore.setState({
    workspaces: spaces,
    current: first,
    loaded: true,
  });
  const reload = useWorkspaceStore.getState().loadWorkspaces();
  useWorkspaceStore.getState().setCurrent(second);
  await write;
  finishList?.(spaces);
  await reload;
  expect(useWorkspaceStore.getState().current).toEqual(second);
  expect(
    JSON.parse(local.get("houston.pref.last_workspace_id.device") ?? "null"),
  ).toEqual({
    value: second.id,
    accountWriteSucceeded: !refused,
  });
  expect(mocks.resolve).not.toHaveBeenCalled();
});

test("reset discards an older boot resolution before publishing or pinning", async () => {
  let finish: ((value: typeof first) => void) | undefined;
  mocks.list.mockResolvedValue(spaces);
  mocks.resolve.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const boot = useWorkspaceStore.getState().loadWorkspaces();
  await vi.waitFor(() => expect(finish).toBeDefined());
  useWorkspaceStore.getState().reset();
  finish?.(first);
  await boot;
  expect(useWorkspaceStore.getState().current).toBeNull();
  expect(useWorkspaceStore.getState().workspaces).toEqual([]);
  expect(useWorkspaceStore.getState().loading).toBe(true);
  expect(mocks.pin).not.toHaveBeenCalled();
});

test("a vanished current space uses the refresh path and resets space caches", async () => {
  useWorkspaceStore.setState({
    workspaces: spaces,
    current: second,
    loaded: true,
  });
  mocks.list.mockResolvedValue([personal, first]);
  mocks.pin.mockReturnValue(true);
  await useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().current).toEqual(first);
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.pin).toHaveBeenCalledWith("aaaaaaaaaaaaaaaa");
  expect(mocks.resetCache).toHaveBeenCalledWith({}, true);
});
