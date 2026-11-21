import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const appMocks = vi.hoisted(() => ({
  prefGet: vi.fn<(key: string) => Promise<string | null>>(),
  list: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../../app/src/lib/tauri", () => ({
  tauriPreferences: {
    get: appMocks.prefGet,
    set: vi.fn(),
    resolveWorkspace: async (workspaces: Promise<unknown[]>) =>
      (await workspaces)[0] ?? null,
  },
  tauriWorkspaces: { list: appMocks.list },
}));
vi.mock("../../../app/src/lib/engine", () => ({
  setActiveOrg: () => false,
  setPreferenceErrorReporter: () => {},
}));
vi.mock("../../../app/src/lib/analytics", () => ({
  analytics: { track: () => {} },
}));
vi.mock("../../../app/src/lib/error-report", () => ({
  logAndReportError: appMocks.report,
}));

const originalFetch = globalThis.fetch;

class FakeStorage {
  private readonly entries = new Map<string, string>();
  blockRead = false;
  blockWrite = false;
  blockRemove = false;

  getItem = (key: string): string | null => {
    if (this.blockRead) throw new Error("storage read blocked");
    return this.entries.get(key) ?? null;
  };
  setItem = (key: string, value: string): void => {
    if (this.blockWrite) throw new Error("quota exceeded");
    this.entries.set(key, value);
  };
  removeItem = (key: string): void => {
    if (this.blockRemove) throw new Error("storage remove blocked");
    this.entries.delete(key);
  };
  has = (key: string): boolean => this.entries.has(key);
  seed = (key: string, value: string): void =>
    void this.entries.set(key, value);
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

function stubFetch(...responses: Response[]): void {
  globalThis.fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = () =>
  new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });

test("a device write that cannot persist REJECTS, so the caller reverts and reports", async () => {
  storage.blockWrite = true;

  await expect(client().setPreference("theme.dark", "nord")).rejects.toThrow(
    "quota exceeded",
  );
});

test("clearing a device preference REJECTS when the store refuses the removal", async () => {
  storage.seed("houston.pref.theme", "dark");
  storage.blockRemove = true;

  await expect(client().setPreference("theme", null)).rejects.toThrow(
    "storage remove blocked",
  );
  expect(storage.has("houston.pref.theme")).toBe(true);
});

test("a device read that cannot answer REJECTS instead of reading as unset", async () => {
  storage.seed("houston.pref.theme", "dark");
  storage.blockRead = true;

  await expect(client().getPreference("theme")).rejects.toThrow(
    "storage read blocked",
  );
});

test("the synthetic-id default is for a preference that is UNSET, never for a store that failed", async () => {
  storage.blockRead = true;

  await expect(client().getPreference("last_agent_id")).rejects.toThrow(
    "storage read blocked",
  );
});

test("an account write survives a device copy the store will not remove", async () => {
  storage.seed("houston.pref.timezone", "America/New_York");
  storage.blockRemove = true;
  stubFetch(json(200, { value: "America/Bogota" }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await expect(
    client().setPreference("timezone", "America/Bogota"),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
});

test("an account read the host answers survives a device copy the store will not read", async () => {
  storage.blockRead = true;
  stubFetch(json(200, { value: null }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await expect(client().getPreference("timezone")).resolves.toBeNull();
  expect(warn).toHaveBeenCalledOnce();
});

const personal = {
  id: "ws-default",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00Z",
};

const blockedRead = () => new Error("storage read blocked");

test("a boot preference read that rejects answers unset and reports once", async () => {
  appMocks.report.mockImplementation(() => {});
  appMocks.prefGet.mockRejectedValue(blockedRead());

  const { readBootPreference } = await import(
    "../../../app/src/lib/boot-preference"
  );

  await expect(readBootPreference("last_agent_id")).resolves.toBeNull();
  expect(appMocks.report).toHaveBeenCalledOnce();
  expect(appMocks.report.mock.calls[0]?.[0]).toBe(
    "device_pref_unreadable:last_agent_id",
  );
});

test("a boot preference read the store answers is passed through unreported", async () => {
  appMocks.report.mockImplementation(() => {});
  appMocks.prefGet.mockResolvedValue("agent-7");

  const { readBootPreference } = await import(
    "../../../app/src/lib/boot-preference"
  );

  await expect(readBootPreference("last_agent_id")).resolves.toBe("agent-7");
  expect(appMocks.report).not.toHaveBeenCalled();
});

test("loadWorkspaces still fails loudly when the LIST is what rejected", async () => {
  appMocks.report.mockImplementation(() => {});
  appMocks.list.mockRejectedValue(new Error("host unreachable"));
  appMocks.prefGet.mockResolvedValue(personal.id);

  const { useWorkspaceStore } = await import(
    "../../../app/src/stores/workspaces"
  );
  useWorkspaceStore.setState({ workspaces: [], current: null });
  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.loadError).toBe(true);
  expect(state.current).toBeNull();
  expect(appMocks.report).not.toHaveBeenCalled();
});
