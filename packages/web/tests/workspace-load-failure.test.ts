import { beforeEach, expect, test, vi } from "vitest";

const {
  track,
  logAndReportError,
  reportError,
  listWorkspaces,
  getPreference,
  setPreference,
  setActiveOrg,
} = vi.hoisted(() => ({
  track: vi.fn(),
  logAndReportError: vi.fn(),
  reportError: vi.fn(),
  listWorkspaces: vi.fn(),
  getPreference: vi.fn(),
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
    get: getPreference,
    set: setPreference,
    resolveWorkspace: async (workspaces: Promise<unknown[]>) =>
      (await workspaces)[0] ?? null,
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
  getPreference.mockReset().mockResolvedValue(null);
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

test("a failed load settles as an error the gate can act on", async () => {
  listWorkspaces.mockRejectedValue(new Error("gateway unreachable"));

  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.loading).toBe(false);
  expect(state.loaded).toBe(true);
  expect(state.loadError).toBe(true);
  expect(state.current).toBeNull();
});

test("a failed load adds no telemetry of its own", async () => {
  listWorkspaces.mockRejectedValue(new Error("gateway unreachable"));

  await useWorkspaceStore.getState().loadWorkspaces();

  expect(logAndReportError).not.toHaveBeenCalled();
  expect(reportError).not.toHaveBeenCalled();
});

test("a failed load leaves the remembered space preference untouched", async () => {
  getPreference.mockResolvedValue("org:00112233aabbccdd");
  listWorkspaces.mockRejectedValue(new Error("gateway unreachable"));

  await useWorkspaceStore.getState().loadWorkspaces();

  expect(setPreference).not.toHaveBeenCalled();
  expect(setActiveOrg).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().current).toBeNull();
});

test("a successful load lands the workspace and clears the error", async () => {
  listWorkspaces.mockResolvedValue([PERSONAL]);

  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.loading).toBe(false);
  expect(state.loaded).toBe(true);
  expect(state.loadError).toBe(false);
  expect(state.current?.id).toBe("ws_personal");
});

test("a successful load with zero workspaces is empty, not failed", async () => {
  listWorkspaces.mockResolvedValue([]);

  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.loaded).toBe(true);
  expect(state.loadError).toBe(false);
  expect(state.current).toBeNull();
});

test("a retry stays `loaded` so the boot splash never remounts the app", async () => {
  listWorkspaces.mockRejectedValueOnce(new Error("gateway unreachable"));
  await useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().loadError).toBe(true);

  listWorkspaces.mockResolvedValue([PERSONAL]);
  const retry = useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().loading).toBe(true);
  expect(useWorkspaceStore.getState().loaded).toBe(true);
  await retry;

  const state = useWorkspaceStore.getState();
  expect(state.loadError).toBe(false);
  expect(state.current?.id).toBe("ws_personal");
});
