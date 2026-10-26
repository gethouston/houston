import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const {
  track,
  logAndReportError,
  reportError,
  listWorkspaces,
  resolveWorkspace,
  setPreference,
  setActiveOrg,
} = vi.hoisted(() => ({
  track: vi.fn(),
  logAndReportError: vi.fn(),
  reportError: vi.fn(),
  listWorkspaces: vi.fn(),
  resolveWorkspace: vi.fn(),
  setPreference: vi.fn(),
  setActiveOrg: vi.fn(),
}));

vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError,
  reportError,
}));
vi.mock("@houston/app/lib/engine", () => ({
  setActiveOrg,
  setPreferenceErrorReporter: () => {},
}));
vi.mock("@houston/app/lib/analytics", () => ({
  analytics: { track },
}));
vi.mock("@houston/app/lib/query-client", () => ({ queryClient: {} }));
vi.mock("@houston/app/lib/space-cache", () => ({
  resetCacheForSpaceChange: vi.fn(),
}));
vi.mock("@houston/app/lib/tauri", () => ({
  tauriWorkspaces: { list: listWorkspaces },
  tauriPreferences: {
    resolveWorkspace,
    set: setPreference,
    rememberWorkspace: vi.fn(async () => {}),
  },
}));

import { useWorkspaceStore } from "@houston/app/stores/workspaces";

const PERSONAL = {
  id: "ws_personal",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  track.mockReset();
  logAndReportError.mockReset();
  reportError.mockReset();
  listWorkspaces.mockReset();
  resolveWorkspace.mockReset();
  setPreference.mockReset().mockResolvedValue(undefined);
  setActiveOrg.mockReset();
  useWorkspaceStore.setState({
    workspaces: [],
    current: null,
    loading: true,
    loaded: false,
    loadError: false,
  });
});

const TEAM = {
  ...PERSONAL,
  id: "org:00112233aabbccdd",
  name: "Team",
  isDefault: false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a hung real-adapter preference read releases boot into the device's space", async () => {
  vi.useFakeTimers();
  const local = new Map([
    [
      "houston.pref.last_workspace_id.device",
      JSON.stringify({ value: TEAM.id, accountWriteSucceeded: true }),
    ],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  resolveWorkspace.mockImplementation((workspaces) =>
    client.resolveWorkspaceSelection(workspaces),
  );
  listWorkspaces.mockResolvedValue([PERSONAL, TEAM]);
  const boot = useWorkspaceStore.getState().loadWorkspaces();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(useWorkspaceStore.getState().loaded).toBe(true);
  await boot;
  expect(useWorkspaceStore.getState().current?.id).toBe(TEAM.id);
  expect(useWorkspaceStore.getState().loadError).toBe(false);
  expect(logAndReportError).not.toHaveBeenCalled();
});
