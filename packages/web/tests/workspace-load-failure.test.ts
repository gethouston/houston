import { beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-818: `loadWorkspaces()` used to swallow its failure with a console.error,
 * leaving the Settings gate spinning forever on a state nothing would ever
 * resolve. The store now SETTLES that state honestly — `loading` clears,
 * `loaded` flips, and `loadError` records whether the attempt threw — so a
 * gated screen can offer a retry, and can tell "the load broke" apart from
 * "this account has no workspace".
 *
 * What the store must NOT do is report: both awaited calls go through `call()`
 * (`lib/tauri.ts`), which already toasts AND captures to Sentry. A second
 * report here would file two issues for one failure, so the reporting helpers
 * are mocked and asserted untouched.
 *
 * Lives in packages/web rather than app/tests because it needs module mocking:
 * app/tests runs under node:test, which the store's engine/analytics/query
 * imports would drag a real browser environment into.
 */

const {
  logAndReportError,
  reportError,
  listWorkspaces,
  getPreference,
  setPreference,
  setActiveOrg,
} = vi.hoisted(() => ({
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
vi.mock("@houston/app/lib/engine", () => ({ setActiveOrg }));
vi.mock("@houston/app/lib/analytics", () => ({
  analytics: { track: vi.fn() },
}));
vi.mock("@houston/app/lib/query-client", () => ({ queryClient: {} }));
vi.mock("@houston/app/lib/space-cache", () => ({
  resetCacheForSpaceChange: vi.fn(),
}));
vi.mock("@houston/app/lib/tauri", () => ({
  tauriWorkspaces: { list: listWorkspaces },
  tauriPreferences: { get: getPreference, set: setPreference },
}));

import { useWorkspaceStore } from "@houston/app/stores/workspaces";

const PERSONAL = {
  id: "ws_personal",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  logAndReportError.mockReset();
  reportError.mockReset();
  listWorkspaces.mockReset();
  getPreference.mockReset().mockResolvedValue(null);
  setPreference.mockReset();
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
  // `tauriWorkspaces.list` is a `call()`, whose surfaceError already toasts the
  // failure AND captures it to Sentry. Reporting again here filed two issues
  // for one failure — this guards against re-adding it.
  listWorkspaces.mockRejectedValue(new Error("gateway unreachable"));

  await useWorkspaceStore.getState().loadWorkspaces();

  expect(logAndReportError).not.toHaveBeenCalled();
  expect(reportError).not.toHaveBeenCalled();
});

/**
 * HOU-981: `listWorkspaces` now THROWS on a persistent failure instead of
 * silently degrading to personal-only, which makes this guarantee load-bearing.
 * A failed load must not write `last_workspace_id` — the remembered team space
 * has to survive the outage so the next successful load restores it, instead of
 * the user being pinned to personal with all their missions apparently gone.
 */
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

  // The retry the Settings gate fires. `loaded` must stay true throughout: it
  // is what keeps App.tsx's full-screen splash from swapping out the shell
  // mid-retry, while `loading` goes back up so the gate can spin in place.
  listWorkspaces.mockResolvedValue([PERSONAL]);
  const retry = useWorkspaceStore.getState().loadWorkspaces();
  expect(useWorkspaceStore.getState().loading).toBe(true);
  expect(useWorkspaceStore.getState().loaded).toBe(true);
  await retry;

  const state = useWorkspaceStore.getState();
  expect(state.loadError).toBe(false);
  expect(state.current?.id).toBe("ws_personal");
});
