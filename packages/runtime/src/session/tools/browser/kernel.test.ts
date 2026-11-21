import type { BrowserContext } from "playwright-core";
import { afterEach, expect, test, vi } from "vitest";
import { backupState } from "./backup-state";
import { agentWorkspace } from "./browser.test-support";
import {
  createKernelSession,
  deleteKernelSession,
  KERNEL_TIMEOUT_S,
  type Kernel,
  KernelError,
  kernelFrom,
} from "./kernel";
import { fakeBrowser } from "./kernel-browser.test-support";
import { backupFromEnv, kernelBackup } from "./kernel-tab";
import { EMPTY_STATE } from "./state-merge";
import { browserStatePath, readState, saveState } from "./state-store";
import { closeContext } from "./tab-pages";

const KEY = "sk_kernel_secret";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeApi(create: () => Response = () => created("k-1")) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      body:
        init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return init?.method === "POST"
      ? create()
      : new Response(null, { status: 204 });
  });
  const kernel: Kernel = { apiKey: KEY, fetch };
  const deletes = () => calls.filter((c) => c.method === "DELETE");
  return { kernel, calls, deletes };
}

const created = (id: string) =>
  Response.json({
    session_id: id,
    cdp_ws_url: `wss://proxy.kernel.test/browser/cdp?jwt=${id}`,
    headless: true,
    stealth: true,
  });

const logged = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.stringify(spy.mock.calls);

afterEach(() => vi.restoreAllMocks());

test("the key is the switch; without it the fallback is off, said once with the remedy", () => {
  expect(kernelFrom({ KERNEL_API_KEY: " k " })).toEqual({ apiKey: "k" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const backup = backupFromEnv({ KERNEL_API_KEY: "  " });
  expect(backup()).toBeNull();
  expect(backup()).toBeNull();
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0]?.[0]).toContain(
    "[browser] Kernel fallback off: KERNEL_API_KEY is not set",
  );
  expect(error).not.toHaveBeenCalled();
});

test("with the key, the backup is Kernel and nothing is logged", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(backupFromEnv({ KERNEL_API_KEY: KEY })()).not.toBeNull();
  expect(error).not.toHaveBeenCalled();
});

test("a session is headless, stealth, desktop-sized, with the key as a bearer", async () => {
  const { kernel, calls } = fakeApi();
  expect(await createKernelSession(kernel)).toEqual({
    id: "k-1",
    connectUrl: "wss://proxy.kernel.test/browser/cdp?jwt=k-1",
  });
  expect(calls).toEqual([
    {
      url: "https://api.onkernel.com/browsers",
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
      },
      body: {
        stealth: true,
        headless: true,
        timeout_seconds: KERNEL_TIMEOUT_S,
        viewport: { width: 1280, height: 800 },
      },
    },
  ]);
});

test.each([
  [
    429,
    '{"code":"concurrency_limit_exceeded","message":"key sk_x"}',
    "429:concurrency_limit_exceeded",
  ],
  [401, '{"code":"unauthorized"}', "401:unauthorized"],
  [502, "<html>bad gateway</html>", "502:unknown"],
  [400, '{"code":"has spaces and <b>"}', "400:unknown"],
])("a %i is refused by Kernel's code only, never its text", async (status, body, code) => {
  const { kernel } = fakeApi(() => new Response(body, { status }));
  const refused = await createKernelSession(kernel).catch((e: unknown) => e);
  expect(refused).toBeInstanceOf(KernelError);
  expect(refused).toMatchObject({ code });
  expect(String(refused)).not.toContain("sk_");
});

test("an unreachable or slow API is a code, not a crash", async () => {
  const down: Kernel = {
    apiKey: KEY,
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  };
  await expect(createKernelSession(down)).rejects.toMatchObject({
    code: "unreachable",
  });
  const slow: Kernel = {
    apiKey: KEY,
    fetch: async () => {
      throw new DOMException("timed out", "TimeoutError");
    },
  };
  await expect(createKernelSession(slow)).rejects.toMatchObject({
    code: "timeout",
  });
});

test("an answer without a CDP url is refused, and its session deleted", async () => {
  const { kernel, deletes } = fakeApi(() =>
    Response.json({ session_id: "k-2" }),
  );
  await expect(createKernelSession(kernel)).rejects.toMatchObject({
    code: "no_session_in_answer",
  });
  expect(deletes().map((c) => c.url)).toEqual([
    "https://api.onkernel.com/browsers/k-2",
  ]);
});

test("deleting a session is a bodiless DELETE", async () => {
  const { kernel, calls } = fakeApi();
  await deleteKernelSession(kernel, "k/9");
  expect(calls).toEqual([
    {
      url: "https://api.onkernel.com/browsers/k%2F9",
      method: "DELETE",
      headers: { authorization: `Bearer ${KEY}` },
      body: undefined,
    },
  ]);
});

test("the tab connects over the CDP url; closing it deletes the session once", async () => {
  const { kernel, deletes } = fakeApi();
  const remote = fakeBrowser();
  const connect = vi.fn(async () => remote.browser);
  const tab = await kernelBackup(kernel, connect).open(
    "/no/such/state.json",
    3,
    "shop.example",
  );
  expect(connect).toHaveBeenCalledWith(
    "wss://proxy.kernel.test/browser/cdp?jwt=k-1",
  );
  expect(tab.page).toBe(remote.page);
  expect(tab.backup?.host).toBe("shop.example");
  expect(deletes()).toHaveLength(0);
  await closeContext(tab);
  expect(remote.browser.close).toHaveBeenCalledOnce();
  expect(deletes().map((c) => c.url)).toEqual([
    "https://api.onkernel.com/browsers/k-1",
  ]);
});

test("a dropped connection deletes the session", async () => {
  const { kernel, deletes } = fakeApi();
  const remote = fakeBrowser();
  await kernelBackup(kernel, async () => remote.browser).open(
    "/ws/state.json",
    3,
    "shop.example",
  );
  remote.drop();
  await vi.waitFor(() => expect(deletes()).toHaveLength(1));
});

test("a session that never connects is deleted, and the CDP url never logged", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { kernel, deletes } = fakeApi();
  const refused = await kernelBackup(kernel, () =>
    Promise.reject(new Error("connect to wss://proxy.kernel.test/?jwt=k-1")),
  )
    .open("/ws/state.json", 3, "shop.example")
    .catch((e: unknown) => e);
  expect(refused).toMatchObject({ code: "connect_failed" });
  expect(String(refused)).not.toContain("jwt");
  expect(deletes()).toHaveLength(1);
  expect(logged(error)).not.toContain("jwt");
});

const cookie = (name: string, domain = ".shop.example") => ({
  name,
  value: "v",
  domain,
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: true,
  sameSite: "Lax" as const,
});

test("the saved sign-ins load into the Kernel tab, the wall's cookies left out", async () => {
  const statePath = browserStatePath(agentWorkspace("kernel-state-"));
  const origins = [
    {
      origin: "https://shop.example",
      localStorage: [{ name: "t", value: "1" }],
    },
  ];
  const ours = {
    cookies: [
      cookie("sid"),
      cookie("cf_clearance"),
      cookie("mail", "mail.other.example"),
    ],
    origins: [
      ...origins,
      { origin: "https://other.example", localStorage: [] },
    ],
  };
  await saveState({
    context: { storageState: async () => ours } as unknown as BrowserContext,
    statePath,
    base: EMPTY_STATE,
  });
  const { kernel } = fakeApi();
  const remote = fakeBrowser();
  const tab = await kernelBackup(kernel, async () => remote.browser).open(
    statePath,
    3,
    "shop.example",
  );
  expect(remote.context.setStorageState).toHaveBeenCalledExactlyOnceWith({
    cookies: [cookie("sid")],
    origins,
  });
  await closeContext(tab);
});

test("sign-ins carry over to Kernel; anti-bot vendors' cookies do not", () => {
  const names = [
    "sid",
    "session-token",
    "__cf_bm",
    "cf_clearance",
    "_abck",
    "bm_sz",
    "_px3",
    "_pxvid",
    "pxcts",
    "datadome",
    "incap_ses_123_456",
    "visid_incap_456",
    "aws-waf-token",
  ];
  const kept = backupState(
    { cookies: names.map((n) => cookie(n)), origins: [] },
    "www.shop.example",
  );
  expect(kept.cookies.map((c) => c.name)).toEqual(["sid", "session-token"]);
});

test("Kernel gets only the blocked site's sign-ins", () => {
  const domains = [
    ".shop.example",
    "shop.example",
    "www.shop.example",
    "login.shop.example",
    ".example",
    "other.example",
    "shop.example.evil",
    "evilshop.example",
  ];
  const kept = backupState(
    {
      cookies: domains.map((d) => cookie(d, d)),
      origins: [
        { origin: "https://login.shop.example", localStorage: [] },
        { origin: "https://other.example", localStorage: [] },
        { origin: "not a url", localStorage: [] },
      ],
    },
    "www.shop.example",
  );
  expect(kept.cookies.map((c) => c.domain)).toEqual([
    ".shop.example",
    "shop.example",
    "www.shop.example",
    "login.shop.example",
    ".example",
  ]);
  expect(kept.origins.map((o) => o.origin)).toEqual([
    "https://login.shop.example",
  ]);
});

test("saving from the Kernel tab never overwrites another site's sign-in", async () => {
  const statePath = browserStatePath(agentWorkspace("kernel-save-"));
  const other = { origin: "https://other.example", localStorage: [] };
  await saveState({
    context: {
      storageState: async () => ({
        cookies: [cookie("sid"), cookie("mail", "mail.other.example")],
        origins: [other],
      }),
    } as unknown as BrowserContext,
    statePath,
    base: EMPTY_STATE,
  });
  const { kernel } = fakeApi();
  const remote = fakeBrowser();
  const tab = await kernelBackup(kernel, async () => remote.browser).open(
    statePath,
    3,
    "www.shop.example",
  );
  Object.assign(remote.context, {
    storageState: async () => ({
      cookies: [
        { ...cookie("sid"), value: "new" },
        { ...cookie("mail", "mail.other.example"), value: "anon" },
      ],
      origins: [
        {
          origin: "https://other.example",
          localStorage: [{ name: "a", value: "1" }],
        },
      ],
    }),
  });
  await saveState(tab);
  const saved = await readState(statePath);
  expect(saved?.cookies.map((c) => [c.domain, c.value])).toEqual(
    expect.arrayContaining([
      [".shop.example", "new"],
      ["mail.other.example", "v"],
    ]),
  );
  expect(saved?.origins).toEqual([other]);
  await closeContext(tab);
});
