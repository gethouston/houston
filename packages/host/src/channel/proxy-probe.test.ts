import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { ForwardRequest, RuntimeEndpoint } from "../ports";
import { ProxyChannel } from "./proxy";

/**
 * HOU cold-boot probe behavior: the desktop fires read-only status probes
 * (providers, provider usage, auth status) the moment a chat or the provider
 * picker mounts. On a sleeping runtime those used to hold the HTTP socket for
 * the WHOLE cold boot (up to the 60s health budget), so the picker spinner sat
 * there. They must answer fast with a retryable 503 while the boot continues in
 * the background — a turn (or any other route) still waits for the runtime.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "local",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 1,
};
const ctx = { workspace: ws, agent };

const urlFor = (rest: string) => new URL(`http://host/agents/agent-1/${rest}`);
const request = () => ({ headers: {} }) as unknown as IncomingMessage;

function fakeRes() {
  const captured = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers: Record<string, string> = {}) {
      captured.statusCode = status;
      Object.assign(captured.headers, headers);
      return captured;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? chunk.toString() : "";
      return captured;
    },
  };
  return captured;
}

const res = () => fakeRes();
const asServerResponse = (r: ReturnType<typeof fakeRes>) =>
  r as unknown as ServerResponse;

/**
 * A launcher whose runtime is asleep and whose boot is released by the test —
 * single-flight like the real ProcessLauncher: every caller during a boot rides
 * the SAME spawn, so a racing probe can never double-spawn.
 */
function coldRuntime() {
  const endpoint: RuntimeEndpoint = {
    baseUrl: "http://127.0.0.1:5000",
    token: "rt-token",
  };
  let settle!: () => void;
  let abort!: (err: Error) => void;
  let spawns = 0;
  let awake = false;
  const sleeps: string[] = [];
  const boot = new Promise<RuntimeEndpoint>((resolve, reject) => {
    settle = () => {
      awake = true;
      resolve(endpoint);
    };
    abort = reject;
  });
  return {
    endpoint,
    sleeps,
    get spawns() {
      return spawns;
    },
    ready: () => settle(),
    crash: (err: Error) => abort(err),
    launcher: {
      async ensureAwake() {
        if (awake) return endpoint;
        if (spawns === 0) spawns++;
        return boot;
      },
      async sleep(agentId: string) {
        sleeps.push(agentId);
      },
      async destroy() {},
      async status() {
        // Mid-boot the real launcher already reports "running" (the live-set
        // entry exists before the child is healthy) — the probe path must not
        // trust it as "reachable".
        return "running" as const;
      },
    },
  };
}

function channelFor(rt: ReturnType<typeof coldRuntime>) {
  const forwarded: ForwardRequest[] = [];
  const channel = new ProxyChannel({
    launcher: rt.launcher,
    proxy: {
      async forward(_endpoint, req) {
        forwarded.push(req);
      },
    },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
  });
  return { channel, forwarded };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("a provider probe answers 503 + Retry-After instead of holding the socket through a cold boot", async () => {
  const rt = coldRuntime();
  const { channel, forwarded } = channelFor(rt);
  const out = res();

  const dispatched = channel.dispatch(
    ctx,
    "GET",
    "providers",
    urlFor("providers"),
    request(),
    asServerResponse(out),
  );
  let answered = false;
  void dispatched.then(() => {
    answered = true;
  });

  await vi.advanceTimersByTimeAsync(100);
  expect(answered).toBe(false); // a fast boot must still be awaited

  await vi.advanceTimersByTimeAsync(1_500);
  await dispatched;

  expect(out.statusCode).toBe(503);
  expect(out.headers["Retry-After"]).toBe("2");
  expect(JSON.parse(out.body)).toMatchObject({ error: expect.any(String) });
  expect(forwarded).toEqual([]); // nothing reached a runtime that isn't up
});

test("the deadlined probe leaves the boot running, so the client's retry lands on a live runtime", async () => {
  const rt = coldRuntime();
  const { channel, forwarded } = channelFor(rt);

  await (async () => {
    const first = channel.dispatch(
      ctx,
      "GET",
      "providers",
      urlFor("providers"),
      request(),
      asServerResponse(res()),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    await first;
  })();

  // The boot was NOT aborted — it completes on its own moments later.
  expect(rt.sleeps).toEqual([]);
  rt.ready();

  const out = res();
  await channel.dispatch(
    ctx,
    "GET",
    "providers",
    urlFor("providers"),
    request(),
    asServerResponse(out),
  );

  expect(forwarded.map((f) => f.path)).toEqual(["/providers"]);
  expect(out.statusCode).toBe(0); // untouched: the proxy owns the response now
  expect(rt.spawns).toBe(1); // one shared boot, never a second spawn
});

test.each([
  "providers",
  "providers/usage",
  "auth/status",
])("the read-only probe route %s fast-fails on a cold runtime", async (rest) => {
  const rt = coldRuntime();
  const { channel, forwarded } = channelFor(rt);
  const out = res();

  const dispatched = channel.dispatch(
    ctx,
    "GET",
    rest,
    urlFor(rest),
    request(),
    asServerResponse(out),
  );
  await vi.advanceTimersByTimeAsync(1_500);
  await dispatched;

  expect(out.statusCode).toBe(503);
  expect(forwarded).toEqual([]);
});

test("a warm runtime forwards a probe immediately, with no deadline in play", async () => {
  const rt = coldRuntime();
  rt.ready(); // already awake
  const { channel, forwarded } = channelFor(rt);
  const out = res();

  await channel.dispatch(
    ctx,
    "GET",
    "providers",
    urlFor("providers"),
    request(),
    asServerResponse(out),
  );

  expect(forwarded.map((f) => f.path)).toEqual(["/providers"]);
  expect(out.statusCode).toBe(0);
});

test("a non-probe route keeps waiting for the whole cold boot", async () => {
  const rt = coldRuntime();
  const { channel, forwarded } = channelFor(rt);

  const dispatched = channel.dispatch(
    ctx,
    "GET",
    "events",
    urlFor("events"),
    request(),
    asServerResponse(res()),
  );
  let answered = false;
  void dispatched.then(() => {
    answered = true;
  });

  await vi.advanceTimersByTimeAsync(30_000);
  expect(answered).toBe(false); // the SSE stream waits for its runtime

  rt.ready();
  await dispatched;
  expect(forwarded.map((f) => f.path)).toEqual(["/events"]);
});

test("a probe whose boot fails before the deadline surfaces the failure", async () => {
  const rt = coldRuntime();
  const { channel } = channelFor(rt);

  const dispatched = channel.dispatch(
    ctx,
    "GET",
    "providers",
    urlFor("providers"),
    request(),
    asServerResponse(res()),
  );
  rt.crash(new Error("runtime exited before becoming healthy"));

  await expect(dispatched).rejects.toThrow("exited before becoming healthy");
});

test("a boot that fails AFTER the probe was answered is not an unhandled rejection", async () => {
  const rt = coldRuntime();
  const { channel } = channelFor(rt);
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    const dispatched = channel.dispatch(
      ctx,
      "GET",
      "providers",
      urlFor("providers"),
      request(),
      asServerResponse(res()),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    await dispatched;

    // Real timers from here: Node only reports an unhandled rejection once the
    // microtask queue drains on a real event-loop turn.
    vi.useRealTimers();
    rt.crash(new Error("runtime exited before becoming healthy"));
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).not.toHaveBeenCalled();
  } finally {
    process.off("unhandledRejection", unhandled);
  }
});
