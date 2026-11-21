// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  declareProvisionalReady,
  declareReadyWhenShellRenders,
  MOUNT_DEADLINE_MS,
  PROVISIONAL_READY_KEY,
  type ReadyPorts,
  SHELL_SETTLE_MS,
} from "./ready";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  values.clear();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => vi.useRealTimers());

function ports(
  bundleId = "ota-7",
  status = "pending",
): ReadyPorts & {
  notifyAppReady: ReturnType<typeof vi.fn>;
  resetToBuiltin: ReturnType<typeof vi.fn>;
  report: ReturnType<typeof vi.fn>;
} {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing root");
  return {
    root,
    notifyAppReady: vi.fn().mockResolvedValue({}),
    currentBundle: async () => ({ id: bundleId, status }),
    resetToBuiltin: vi.fn().mockResolvedValue(undefined),
    storage,
    report: vi.fn(),
  };
}

const render = (html: string) => {
  const root = document.getElementById("root");
  if (root) root.innerHTML = html;
};

test("nothing is ready before the web app mounts", async () => {
  const p = ports();
  declareReadyWhenShellRenders(p);
  await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS);
  expect(p.notifyAppReady).not.toHaveBeenCalled();
  expect(p.resetToBuiltin).not.toHaveBeenCalled();
});

test("a boot splash that stays up counts: a slow network never rolls back", async () => {
  const p = ports();
  declareReadyWhenShellRenders(p);
  render("<div data-houston-boot-loading></div>");
  await vi.advanceTimersByTimeAsync(SHELL_SETTLE_MS - 1);
  expect(p.notifyAppReady).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(p.notifyAppReady).toHaveBeenCalledOnce();
});

test("a crash right after first paint is never marked ready", async () => {
  const p = ports();
  declareReadyWhenShellRenders(p);
  render("<main>Shell</main>");
  await vi.advanceTimersByTimeAsync(SHELL_SETTLE_MS / 2);
  render("<div data-houston-boot-crashed>boom</div>");
  await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS);
  expect(p.notifyAppReady).not.toHaveBeenCalled();
});

test("an offline launch puts only an unconfirmed OTA bundle on trial", async () => {
  const fresh = ports("ota-7", "pending");
  await declareProvisionalReady(fresh);
  expect(fresh.notifyAppReady).toHaveBeenCalledOnce();
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBe("ota-7");
  await declareProvisionalReady(ports("ota-7", "success"));
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBe("ota-7");
  values.clear();
  const confirmed = ports("ota-7", "success");
  await declareProvisionalReady(confirmed);
  expect(confirmed.notifyAppReady).toHaveBeenCalledOnce();
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBeNull();
  await declareProvisionalReady(ports("builtin", "pending"));
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBeNull();
});

test("a provisional bundle that crashes online is reset to builtin and reported", async () => {
  storage.setItem(PROVISIONAL_READY_KEY, "ota-7");
  const p = ports("ota-7");
  declareReadyWhenShellRenders(p);
  render("<div data-houston-boot-crashed>boom</div>");
  await vi.advanceTimersByTimeAsync(0);
  expect(p.resetToBuiltin).toHaveBeenCalledOnce();
  expect(p.report).toHaveBeenCalledWith(expect.any(Error));
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBeNull();
});

test("a provisional bundle that never mounts the app online is reset", async () => {
  storage.setItem(PROVISIONAL_READY_KEY, "ota-7");
  const p = ports("ota-7");
  declareReadyWhenShellRenders(p);
  await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS);
  expect(p.resetToBuiltin).toHaveBeenCalledOnce();
});

test("a provisional bundle whose splash stays up online is confirmed", async () => {
  storage.setItem(PROVISIONAL_READY_KEY, "ota-7");
  const p = ports("ota-7");
  declareReadyWhenShellRenders(p);
  render("<div data-houston-boot-loading></div>");
  await vi.advanceTimersByTimeAsync(MOUNT_DEADLINE_MS);
  expect(p.notifyAppReady).toHaveBeenCalledOnce();
  expect(p.resetToBuiltin).not.toHaveBeenCalled();
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBeNull();
});

test("a provisional bundle whose web entry throws is reset at once", async () => {
  storage.setItem(PROVISIONAL_READY_KEY, "ota-7");
  const p = ports("ota-7");
  const watch = declareReadyWhenShellRenders(p);
  watch.fail(new Error("chunk failed"));
  await vi.advanceTimersByTimeAsync(0);
  expect(p.resetToBuiltin).toHaveBeenCalledOnce();
  expect(String(p.report.mock.calls[0]?.[0])).toContain("chunk failed");
});

test("the shell starts its readiness watch before loading the web entry", async () => {
  const { readFileSync } = await import("node:fs");
  const main = readFileSync("src/main.ts", "utf8");
  const start = main.slice(main.indexOf("async function start"));
  expect(start.indexOf("declareReadyWhenShellRenders(")).toBeLessThan(
    start.indexOf('await import("../../web/src/main")'),
  );
  expect(start).toContain("ready.fail(error);");
});

test("an online launch waits for the offline trial marker before watching", async () => {
  const { readFileSync } = await import("node:fs");
  const main = readFileSync("src/main.ts", "utf8");
  const start = main.slice(main.indexOf("async function start"));
  expect(start.indexOf("await provisionalReady;")).toBeGreaterThan(-1);
  expect(start.indexOf("await provisionalReady;")).toBeLessThan(
    start.indexOf("declareReadyWhenShellRenders("),
  );
  expect(main).toContain("provisionalReady = declareProvisionalReady(");
});

test("the offline trial marker settles even if notifyAppReady never answers", async () => {
  const p = ports("ota-7", "pending");
  p.notifyAppReady.mockReturnValue(new Promise(() => {}));
  await declareProvisionalReady(p);
  expect(storage.getItem(PROVISIONAL_READY_KEY)).toBe("ota-7");
  const failing = ports("ota-8", "pending");
  failing.notifyAppReady.mockRejectedValue(new Error("native"));
  await declareProvisionalReady(failing);
  await vi.advanceTimersByTimeAsync(0);
  expect(failing.report).toHaveBeenCalledWith(expect.any(Error));
});
