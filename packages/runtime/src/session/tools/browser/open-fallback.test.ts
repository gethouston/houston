import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Block } from "./block-detect";
import { BrowserToolError } from "./errors";
import { KernelError } from "./kernel";
import { BACKUP_NOTE, BLOCKED_NOTE, openWithFallback } from "./open-fallback";
import type { BrowserTab } from "./open-tab";
import type { ActionOutcome } from "./run-action";
import type { TabSwap } from "./tab-swap";

const run = vi.hoisted(() => vi.fn());
vi.mock("./run-action", () => ({ runBrowserAction: run }));

const OPEN = {
  action: "open" as const,
  url: "https://shop.example/item",
  view: { interactive: false, links: false },
};

const local = { name: "local" } as unknown as BrowserTab;
const backupTab = {
  name: "backup",
  backup: { host: "shop.example", dispose: async () => undefined },
} as unknown as BrowserTab;

const page = (text: string, blocked?: Block): ActionOutcome => ({
  content: [{ type: "text", text }],
  mutated: true,
  ...(blocked ? { blocked } : {}),
});

function fakeSwap(backup: (() => Promise<BrowserTab>) | null) {
  const swap = {
    openBackup: backup ? vi.fn(backup) : null,
    adopt: vi.fn(async () => undefined),
    dropBackup: vi.fn(async () => undefined),
    reopenLocal: vi.fn(async () => local),
  };
  return swap satisfies TabSwap;
}

const texts = (outcome: ActionOutcome) =>
  outcome.content.map((c) => (c.type === "text" ? c.text : ""));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.clearAllMocks());

test("without the key, an open is a plain open: no detection, no Kernel", async () => {
  run.mockResolvedValueOnce(page("Opened."));
  const swap = fakeSwap(null);
  const acted = await openWithFallback(local, OPEN, swap);
  expect(run).toHaveBeenCalledExactlyOnceWith(local, OPEN, undefined);
  expect(acted).toEqual({ tab: local, outcome: page("Opened.") });
});

test("a page that is not blocked stays here and never calls Kernel", async () => {
  run.mockResolvedValueOnce(page("Opened."));
  const swap = fakeSwap(async () => backupTab);
  const acted = await openWithFallback(local, OPEN, swap);
  expect(run).toHaveBeenCalledWith(local, OPEN, undefined, true);
  expect(swap.openBackup).not.toHaveBeenCalled();
  expect(acted.tab).toBe(local);
});

test("a blocked page moves the conversation to Kernel and says so in one line", async () => {
  run
    .mockResolvedValueOnce(page("Just a moment", { reason: "cloudflare" }))
    .mockResolvedValueOnce(page("Opened. Products"));
  const swap = fakeSwap(async () => backupTab);
  const acted = await openWithFallback(local, OPEN, swap);
  expect(swap.openBackup).toHaveBeenCalledWith("shop.example");
  expect(run).toHaveBeenLastCalledWith(backupTab, OPEN, undefined, true);
  expect(swap.adopt).toHaveBeenCalledWith(backupTab);
  expect(acted.tab).toBe(backupTab);
  expect(texts(acted.outcome)).toEqual([BACKUP_NOTE, "Opened. Products"]);
});

test.each([
  ["Kernel refuses", () => Promise.reject(new KernelError("429:concurrency"))],
  ["Kernel times out", () => Promise.reject(new KernelError("timeout"))],
])(
  "%s: the local page stands, and the model is told the site blocked it",
  async (_, open) => {
    run.mockResolvedValueOnce(page("Just a moment", { reason: "cloudflare" }));
    const swap = fakeSwap(open);
    const acted = await openWithFallback(local, OPEN, swap);
    expect(acted.tab).toBe(local);
    expect(texts(acted.outcome)).toEqual([BLOCKED_NOTE, "Just a moment"]);
    expect(swap.adopt).not.toHaveBeenCalled();
    expect(swap.dropBackup).toHaveBeenCalled();
  },
);

test("Kernel's proxy refusing the site keeps the local page and logs the code", async () => {
  run
    .mockResolvedValueOnce(page("Blocked", { reason: "denied_status" }))
    .mockResolvedValueOnce(
      page("PROXY error", {
        reason: "backup_proxy",
        code: "provider_blacklisted",
      }),
    );
  const swap = fakeSwap(async () => backupTab);
  const acted = await openWithFallback(local, OPEN, swap);
  expect(acted.tab).toBe(local);
  expect(texts(acted.outcome)[0]).toBe(BLOCKED_NOTE);
  expect(swap.dropBackup).toHaveBeenCalled();
  // Logged as a warning: a site Kernel refuses too is no fault of ours.
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain(
    "provider_blacklisted",
  );
  expect(console.error).not.toHaveBeenCalled();
});

test("Kernel itself failing is an error the operator hears about", async () => {
  run.mockResolvedValueOnce(page("Blocked", { reason: "cloudflare" }));
  const swap = fakeSwap(() =>
    Promise.reject(new KernelError("401:unauthorized")),
  );
  await openWithFallback(local, OPEN, swap);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain(
    "401:unauthorized",
  );
});

test("an anti-bot connection reset goes to Kernel too", async () => {
  run
    .mockRejectedValueOnce(
      new Error("page.goto: net::ERR_HTTP2_PROTOCOL_ERROR"),
    )
    .mockResolvedValueOnce(page("Opened. Products"));
  const swap = fakeSwap(async () => backupTab);
  const acted = await openWithFallback(local, OPEN, swap);
  expect(acted.tab).toBe(backupTab);
});

test("a reset Kernel cannot fix is the model's page_error, with the blocked wording", async () => {
  run.mockRejectedValueOnce(new Error("page.goto: net::ERR_CONNECTION_RESET"));
  const swap = fakeSwap(() => Promise.reject(new KernelError("unreachable")));
  const refused = await openWithFallback(local, OPEN, swap).catch((e) => e);
  expect(refused).toBeInstanceOf(BrowserToolError);
  expect(refused).toMatchObject({ code: "page_error", message: BLOCKED_NOTE });
});

test("other failures are not blocks and never reach Kernel", async () => {
  run.mockRejectedValueOnce(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED"));
  const swap = fakeSwap(async () => backupTab);
  await expect(openWithFallback(local, OPEN, swap)).rejects.toThrow(
    "ERR_NAME_NOT_RESOLVED",
  );
  expect(swap.openBackup).not.toHaveBeenCalled();
});

test("a stopped turn while on Kernel is passed on, not read as a refusal", async () => {
  const stop = new AbortController();
  run
    .mockResolvedValueOnce(page("Blocked", { reason: "cloudflare" }))
    .mockImplementationOnce(async () => {
      stop.abort(new Error("stopped"));
      throw stop.signal.reason;
    });
  const swap = fakeSwap(async () => backupTab);
  await expect(
    openWithFallback(local, OPEN, swap, stop.signal),
  ).rejects.toThrow("stopped");
  expect(swap.dropBackup).toHaveBeenCalled();
});

test("on Kernel, the same site stays there; www. is the same site", async () => {
  run.mockResolvedValueOnce(page("Opened."));
  const swap = fakeSwap(async () => backupTab);
  const www = { ...OPEN, url: "https://www.shop.example/cart" };
  const acted = await openWithFallback(backupTab, www, swap);
  expect(acted.tab).toBe(backupTab);
  expect(swap.reopenLocal).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledExactlyOnceWith(backupTab, www, undefined);
});

test("on Kernel, another site brings the conversation back here first", async () => {
  run.mockResolvedValueOnce(page("Opened."));
  const swap = fakeSwap(async () => backupTab);
  const gov = { ...OPEN, url: "https://www.runt.gov.co/" };
  const acted = await openWithFallback(backupTab, gov, swap);
  expect(swap.reopenLocal).toHaveBeenCalledOnce();
  expect(acted.tab).toBe(local);
  expect(run).toHaveBeenCalledWith(local, gov, undefined, true);
});
