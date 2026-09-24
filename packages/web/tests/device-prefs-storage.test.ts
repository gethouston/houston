import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * A DEVICE preference lives in this browser's localStorage, so a store that is
 * blocked (hardened webview, third-party-cookie blocking) or full (quota) is the
 * only way one can fail to persist. The adapter used to suppress both halves:
 * `setPreference` resolved having stored nothing, so Settings kept the palette
 * the user had just picked on screen, the next boot lost it, and neither the
 * caller's optimistic revert nor any reporting path ever ran.
 *
 * These tests pin the rejection, and its boundary: an ACCOUNT key's pre-fix
 * device copy is a best-effort cleanup behind a host that already answered, so
 * a store refusing to give it up can never fail a preference that DID land.
 *
 * The last block pins the READ side's one hard rule at the other end of the
 * wire: a boot reader takes an unreadable device preference as UNSET and reports
 * it, never as a failed load. A blocked store would otherwise cost a user their
 * whole workspace list — the load and the preference read resolve together, so
 * the rejection reached the list's catch and painted the failure screen.
 */

const appMocks = vi.hoisted(() => ({
  prefGet: vi.fn<(key: string) => Promise<string | null>>(),
  list: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../../app/src/lib/tauri", () => ({
  tauriPreferences: { get: appMocks.prefGet, set: vi.fn() },
  tauriWorkspaces: { list: appMocks.list },
}));
vi.mock("../../../app/src/lib/engine", () => ({ setActiveOrg: () => false }));
vi.mock("../../../app/src/lib/analytics", () => ({
  analytics: { track: () => {} },
}));
vi.mock("../../../app/src/lib/error-report", () => ({
  logAndReportError: appMocks.report,
}));

const originalFetch = globalThis.fetch;

/** A store whose three operations can each be made to throw. */
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

// ── The boot readers: unreadable is UNSET, and it is reported ─────────

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

test("loadWorkspaces keeps the list when the device store cannot answer", async () => {
  appMocks.report.mockImplementation(() => {});
  appMocks.list.mockResolvedValue([personal]);
  appMocks.prefGet.mockRejectedValue(blockedRead());

  const { useWorkspaceStore } = await import(
    "../../../app/src/stores/workspaces"
  );
  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.workspaces).toEqual([personal]);
  expect(state.current?.id).toBe(personal.id);
  // The failure screen (workspaceGateState `failed`) is what this must never be.
  expect(state.loadError).toBe(false);
  expect(state.loaded).toBe(true);
  expect(state.loading).toBe(false);
  expect(appMocks.report).toHaveBeenCalledOnce();
});

test("loadWorkspaces still fails loudly when the LIST is what rejected", async () => {
  appMocks.report.mockImplementation(() => {});
  appMocks.list.mockRejectedValue(new Error("host unreachable"));
  appMocks.prefGet.mockResolvedValue(personal.id);

  const { useWorkspaceStore } = await import(
    "../../../app/src/stores/workspaces"
  );
  // The store is a module singleton shared with the test above.
  useWorkspaceStore.setState({ workspaces: [], current: null });
  await useWorkspaceStore.getState().loadWorkspaces();

  const state = useWorkspaceStore.getState();
  expect(state.loadError).toBe(true);
  expect(state.current).toBeNull();
  // The wire layer (`call`) already logged, toasted and captured that one.
  expect(appMocks.report).not.toHaveBeenCalled();
});
