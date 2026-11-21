import { afterEach, expect, test, vi } from "vitest";

const launch = vi.hoisted(() => vi.fn());
vi.mock("playwright-core", () => ({ chromium: { launch } }));

const { launchBrowser } = await import("./launch");
const { BrowserToolError } = await import("./errors");

afterEach(() => {
  launch.mockReset();
  vi.restoreAllMocks();
});

test("a sandboxed launch that fails is refused loudly with the remedy, never retried without the sandbox", async () => {
  launch.mockRejectedValue(new Error("No usable sandbox!\nmore detail"));
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const refusal = await launchBrowser({ HOUSTON_MANAGED_CLOUD: "1" }).catch(
    (e: unknown) => e,
  );
  expect(refusal).toBeInstanceOf(BrowserToolError);
  expect(refusal).toMatchObject({ code: "browser_unavailable" });
  expect((refusal as Error).message).toContain("Houston's side");
  expect(launch).toHaveBeenCalledTimes(3);
  for (const [options] of launch.mock.calls)
    expect(options).toMatchObject({ chromiumSandbox: true });
  expect(error).toHaveBeenCalledOnce();
  const line = String(error.mock.calls[0]?.[0]);
  expect(line).toContain("not retrying without it");
  expect(line).toContain("user namespaces");
  expect(line).toContain("HOUSTON_BROWSER_SANDBOX=0");
  expect(line).toMatch(/^Playwright headless shell: No usable sandbox!$/m);
});

test("a desktop with no browser at all is only a warning, and the desktop copy", async () => {
  launch.mockRejectedValue(new Error("Executable doesn't exist"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const refusal = await launchBrowser({}).catch((e: unknown) => e);
  expect(refusal).toMatchObject({ code: "browser_unavailable" });
  expect((refusal as Error).message).toContain("Installing Google Chrome");
  expect(warn).toHaveBeenCalledOnce();
});

test("the opt-out launches unsandboxed and says so", async () => {
  const browser = { close: vi.fn(), once: vi.fn() };
  launch.mockResolvedValueOnce(browser);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await expect(launchBrowser({ HOUSTON_BROWSER_SANDBOX: "0" })).resolves.toBe(
    browser,
  );
  expect(launch.mock.calls[0]?.[0]).toMatchObject({ chromiumSandbox: false });
  expect(String(warn.mock.calls[0]?.[0])).toMatch(/sandbox is OFF/);
});

test("by default the sandboxed launch that starts is the browser", async () => {
  const browser = { close: vi.fn(), once: vi.fn() };
  launch.mockResolvedValueOnce(browser);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await expect(launchBrowser({})).resolves.toBe(browser);
  expect(launch.mock.calls[0]?.[0]).toMatchObject({ chromiumSandbox: true });
});

function proxyPort(options: { args?: string[] }): number {
  const flag = options.args?.find((a) => a.startsWith("--proxy-server="));
  return Number(flag?.split(":").at(-1));
}

async function listening(port: number): Promise<boolean> {
  const { connect } = await import("node:net");
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

test("the browser gets its own fence proxy and an environment without secrets; the proxy goes with it", async () => {
  let disconnected: (() => void) | undefined;
  const browser = {
    close: vi.fn(),
    once: (event: string, fn: () => void) => {
      if (event === "disconnected") disconnected = fn;
    },
  };
  launch.mockResolvedValueOnce(browser);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await launchBrowser({
    PATH: "/usr/bin",
    HOUSTON_TURN_TOKEN: "turn-v1.secret",
    HOUSTON_HOST_TOKEN: "host",
  });
  const [options] = launch.mock.calls[0] ?? [];
  expect(options.env).toEqual({ PATH: "/usr/bin" });
  const port = proxyPort(options);
  expect(await listening(port)).toBe(true);
  disconnected?.();
  await vi.waitFor(async () => expect(await listening(port)).toBe(false));
});

test("a launch that fails everywhere closes its fence proxy", async () => {
  launch.mockRejectedValue(new Error("Executable doesn't exist"));
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await launchBrowser({}).catch(() => undefined);
  const port = proxyPort(launch.mock.calls[0]?.[0] ?? {});
  expect(port).toBeGreaterThan(0);
  expect(await listening(port)).toBe(false);
});
