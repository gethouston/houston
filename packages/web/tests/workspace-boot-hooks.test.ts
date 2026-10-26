import "../../../app/tests/support/dom-env";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  list: vi.fn(),
  agents: vi.fn(),
  configs: vi.fn(),
  report: vi.fn(),
  track: vi.fn(),
  available: vi.fn(),
  applyLocale: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("../../../app/src/lib/tauri", () => ({
  tauriPreferences: {
    get: mocks.get,
    set: mocks.set,
    resolveWorkspace: mocks.resolve,
  },
  tauriWorkspaces: { list: mocks.list },
  tauriProvider: { getDefault: async () => null },
}));
vi.mock("../../../app/src/lib/engine", () => ({
  setActiveOrg: () => false,
  setPreferenceErrorReporter: () => {},
}));
vi.mock("../../../app/src/lib/analytics", () => ({
  analytics: { track: mocks.track },
}));
vi.mock("../../../app/src/lib/error-report", () => ({
  logAndReportError: mocks.report,
}));
vi.mock("../../../app/src/lib/query-client", () => ({ queryClient: {} }));
vi.mock("../../../app/src/lib/space-cache", () => ({
  resetCacheForSpaceChange: vi.fn(),
}));
vi.mock("../../../app/src/stores/agent-catalog", () => ({
  useAgentCatalogStore: (select: (s: unknown) => unknown) =>
    select({ loadConfigs: mocks.configs }),
}));
vi.mock("../../../app/src/stores/agents", () => ({
  useAgentStore: (select: (s: unknown) => unknown) =>
    select({
      loadAgents: mocks.agents,
      settleEmpty: vi.fn(),
      setCurrent: vi.fn(),
    }),
}));
vi.mock("../../../app/src/stores/ui", () => ({
  useUIStore: (select: (s: unknown) => unknown) =>
    select({ setClaudeAvailable: mocks.available }),
}));
vi.mock("../../../app/src/lib/i18n", async () => ({
  ...(await import("../../../app/src/lib/locale")),
  applyEngineLocale: mocks.applyLocale,
  changeLocale: vi.fn(),
}));

import { useHoustonInit } from "../../../app/src/hooks/use-houston-init";
import { useLocalePreference } from "../../../app/src/hooks/use-locale-preference";
import { useWorkspaceStore } from "../../../app/src/stores/workspaces";

const team = {
  id: "org:aaaaaaaaaaaaaaaa",
  name: "Team",
  isDefault: false,
  createdAt: "2026-01-01",
};
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (key: string) =>
    key === "last_workspace_id" ? team.id : null,
  );
  mocks.set.mockResolvedValue(undefined);
  mocks.resolve.mockResolvedValue(team);
  mocks.list.mockResolvedValue([team]);
  mocks.configs.mockResolvedValue(undefined);
  mocks.agents.mockResolvedValue(undefined);
  mocks.applyLocale.mockResolvedValue(undefined);
  useWorkspaceStore.setState({
    workspaces: [],
    current: null,
    loading: true,
    loaded: false,
    loadError: false,
  });
});
afterEach(async () => {
  await act(async () => cleanup?.());
  cleanup = undefined;
});

async function mount(hook: () => unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  cleanup = () => {
    root.unmount();
    qc.clear();
  };
  function Probe() {
    hook();
    return null;
  }
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client: qc }, createElement(Probe)),
    ),
  );
}

test("boot uses the store's selection with one preference read and no write-back", async () => {
  await mount(useHoustonInit);
  await vi.waitFor(() => expect(mocks.agents).toHaveBeenCalledWith(team.id));
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.resolve).toHaveBeenCalledWith(expect.any(Promise));
});

test("locale boot consumes the selected workspace without another selection read or lift", async () => {
  await mount(useLocalePreference);
  await vi.waitFor(() => expect(mocks.applyLocale).toHaveBeenCalled());
  expect(mocks.get.mock.calls.map(([key]) => key)).toEqual(["locale"]);
  expect(mocks.list).not.toHaveBeenCalled();
});

test("boot mirrors an automatic team selection without saving an account choice", async () => {
  mocks.get.mockResolvedValue(null);
  await mount(useHoustonInit);
  await vi.waitFor(() => expect(mocks.agents).toHaveBeenCalledWith(team.id));
  expect(mocks.resolve).toHaveBeenCalledWith(expect.any(Promise));
  expect(mocks.set).not.toHaveBeenCalled();
});
