import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { streamGlobalEvents } from "./global-events";
import { WAKE_SETTLE_MS } from "./global-events-contract";

type Conn = {
  res: ServerResponse;
  query: URLSearchParams;
  send(obj: unknown): void;
  raw(text: string): void;
};
type Harness = { baseUrl: string; connections: Conn[] };

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function startServer(
  script: (conn: Conn, index: number) => void,
  statusFor?: (index: number) => number,
): Promise<Harness> {
  const connections: Conn[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const index = connections.length;
    const status = statusFor?.(index) ?? 200;
    if (status !== 200) {
      connections.push({
        res,
        query: url.searchParams,
        send: () => {},
        raw: () => {},
      });
      res.writeHead(status, { "Content-Type": "text/plain" });
      res.end("refused");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": connected\n\n");
    const conn: Conn = {
      res,
      query: url.searchParams,
      send: (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`),
      raw: (text) => res.write(text),
    };
    connections.push(conn);
    script(conn, index);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, connections };
}

const instant = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, 1);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

test("reconnects after each drop; onConnect fires per connect; onEvent gets parsed frames", async () => {
  const h = await startServer((conn, i) => {
    conn.send({ type: "AgentsChanged", n: i });
    conn.res.end();
  });
  const ac = new AbortController();
  const events: unknown[] = [];
  let connects = 0;

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onConnect: () => connects++,
    onEvent: (d) => {
      events.push(d);
      if (events.length === 2) ac.abort();
    },
  });

  expect(connects).toBe(2);
  expect(events).toEqual([
    { type: "AgentsChanged", n: 0 },
    { type: "AgentsChanged", n: 1 },
  ]);
});

test("url() is re-invoked per connect so a rotated query token stays current", async () => {
  let token = "t0";
  const h = await startServer((conn) => conn.res.end());
  const ac = new AbortController();
  let connects = 0;

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events?token=${token}`,
    fetch,
    signal: ac.signal,
    sleep: (ms, signal) => {
      token = "t1";
      return instant(ms, signal);
    },
    onConnect: () => {
      connects++;
      if (connects === 2) ac.abort();
    },
    onEvent: () => {},
  });

  expect(h.connections.map((c) => c.query.get("token"))).toEqual(["t0", "t1"]);
});

test("a 401 with onUnauthorized notifies, does NOT read/connect, then reconnects", async () => {
  const h = await startServer(
    (conn) => {
      conn.send({ type: "AgentsChanged" });
      conn.res.end();
    },
    (i) => (i === 0 ? 401 : 200),
  );
  const ac = new AbortController();
  let unauthorized = 0;
  let connects = 0;
  const errors: unknown[] = [];
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onUnauthorized: () => unauthorized++,
    onConnect: () => connects++,
    onError: (e) => errors.push(e),
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(unauthorized).toBe(1);
  expect(connects).toBe(1);
  expect(errors).toEqual([]);
  expect(events).toEqual([{ type: "AgentsChanged" }]);
});

test("a 401 without onUnauthorized is a plain non-ok drop routed through onError", async () => {
  const h = await startServer(
    (conn) => {
      conn.send({ type: "x" });
      conn.res.end();
    },
    (i) => (i === 0 ? 401 : 200),
  );
  const ac = new AbortController();
  const errors: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onError: (e) => errors.push(e),
    onEvent: () => ac.abort(),
  });

  expect(errors).toHaveLength(1);
  expect(String(errors[0])).toContain("/v1/events 401");
});

test("a malformed frame is swallowed (tolerant read); later frames still arrive", async () => {
  const h = await startServer((conn) => {
    conn.raw("data: {bad json\n\n");
    conn.send({ type: "AgentsChanged" });
    conn.res.end();
  });
  const ac = new AbortController();
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(events).toEqual([{ type: "AgentsChanged" }]);
});

test("a clean 200 close reconnects silently — no onError", async () => {
  const h = await startServer((conn, i) => {
    if (i === 0) {
      conn.res.end();
    } else {
      conn.send({ type: "AgentsChanged" });
      conn.res.end();
    }
  });
  const ac = new AbortController();
  const errors: unknown[] = [];
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onError: (e) => errors.push(e),
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(errors).toEqual([]);
  expect(events).toEqual([{ type: "AgentsChanged" }]);
  expect(h.connections).toHaveLength(2);
});

test("aborting the signal stops the loop after the current attempt", async () => {
  const h = await startServer(() => {});
  const ac = new AbortController();
  let connects = 0;

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onConnect: () => {
      connects++;
      ac.abort();
    },
    onEvent: () => {},
  });

  expect(connects).toBe(1);
  expect(h.connections).toHaveLength(1);
});

const untilPoked = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

test("a silent connection is force-reconnected by the idle watchdog", async () => {
  const h = await startServer((conn, i) => {
    if (i > 0) conn.send({ type: "AgentsChanged" });
  });
  const ac = new AbortController();
  const errors: unknown[] = [];
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    idleTimeoutMs: 60,
    onError: (e) => errors.push(e),
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(events).toEqual([{ type: "AgentsChanged" }]);
  expect(h.connections.length).toBeGreaterThanOrEqual(2);
  expect(String(errors[0])).toContain("stalled");
});

test("backoff grows per failed attempt, is capped, and resets once bytes flow", async () => {
  const caps: number[] = [];
  const h = await startServer(
    (conn) => {
      conn.send({ type: "AgentsChanged" });
      conn.res.end();
    },
    (i) => (i < 3 ? 503 : 200),
  );
  const ac = new AbortController();
  let events = 0;

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    maxDelayMs: 4000,
    jitter: (capMs) => {
      caps.push(capMs);
      return 0;
    },
    onEvent: () => {
      if (++events === 2) ac.abort();
    },
  });

  expect(caps).toEqual([1500, 3000, 4000, 1500]);
});

test("never gives up: an outage longer than any retry budget still recovers", async () => {
  const h = await startServer(
    (conn) => {
      conn.send({ type: "AgentsChanged" });
      conn.res.end();
    },
    (i) => (i < 12 ? 503 : 200),
  );
  const ac = new AbortController();
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    onError: () => {},
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(events).toEqual([{ type: "AgentsChanged" }]);
  expect(h.connections).toHaveLength(13);
});

test("wake cuts a pending backoff short and is torn down with the loop", async () => {
  const h = await startServer(
    (conn) => {
      conn.send({ type: "AgentsChanged" });
      conn.res.end();
    },
    (i) => (i === 0 ? 503 : 200),
  );
  const ac = new AbortController();
  let retryNow: (() => void) | undefined;
  let wakeTornDown = false;
  const events: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: untilPoked,
    wake: (fn) => {
      retryNow = fn;
      return () => {
        wakeTornDown = true;
      };
    },
    onError: () => setTimeout(() => retryNow?.(), 0),
    onEvent: (d) => {
      events.push(d);
      ac.abort();
    },
  });

  expect(events).toEqual([{ type: "AgentsChanged" }]);
  expect(wakeTornDown).toBe(true);
});

test("wake leaves a healthy connection alone", async () => {
  const h = await startServer((conn) => {
    conn.send({ type: "AgentsChanged" });
  });
  const ac = new AbortController();
  let retryNow: (() => void) | undefined;

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    wake: (fn) => {
      retryNow = fn;
      return () => {};
    },
    onEvent: () => {
      retryNow?.();
      ac.abort();
    },
  });

  expect(h.connections).toHaveLength(1);
});

function sleepingPageClock(rate: number): () => number {
  const start = Date.now();
  return () => start + (Date.now() - start) * rate;
}

test("a heartbeating stream survives a page whose timers only run after long sleeps", async () => {
  const h = await startServer((conn) => {
    const beat = setInterval(() => conn.raw(": hb\n\n"), 10);
    conn.res.on("close", () => clearInterval(beat));
  });
  const ac = new AbortController();
  const errors: unknown[] = [];
  let connects = 0;

  const run = streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    idleTimeoutMs: 60,
    now: sleepingPageClock(1000),
    onConnect: () => connects++,
    onError: (e) => errors.push(e),
    onEvent: () => {},
  });
  await new Promise((r) => setTimeout(r, 300));
  ac.abort();
  await run;

  expect(errors).toEqual([]);
  expect(connects).toBe(1);
});

function skewableClock() {
  let skew = 0;
  return {
    now: () => Date.now() + skew,
    sleep: (ms: number) => {
      skew += ms;
    },
  };
}

test("a wake gives a just-woken page time to read the heartbeats it slept through", async () => {
  const clock = skewableClock();
  let retryNow: (() => void) | undefined;
  const h = await startServer((conn) => {
    setTimeout(() => {
      clock.sleep(30_000);
      retryNow?.();
      conn.raw(": hb\n\n");
    }, 20);
  });
  const ac = new AbortController();
  const errors: unknown[] = [];

  const run = streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    now: clock.now,
    wake: (fn) => {
      retryNow = fn;
      return () => {};
    },
    onError: (e) => errors.push(e),
    onEvent: () => {},
  });
  await new Promise((r) => setTimeout(r, WAKE_SETTLE_MS + 300));
  ac.abort();
  await run;

  expect(errors).toEqual([]);
  expect(h.connections).toHaveLength(1);
});

test("a wake still replaces a socket that died while the page slept", async () => {
  const clock = skewableClock();
  let retryNow: (() => void) | undefined;
  const h = await startServer((conn, i) => {
    if (i > 0) {
      conn.send({ type: "AgentsChanged" });
      return;
    }
    setTimeout(() => {
      clock.sleep(30_000);
      retryNow?.();
    }, 20);
  });
  const ac = new AbortController();
  const errors: unknown[] = [];

  await streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    now: clock.now,
    wake: (fn) => {
      retryNow = fn;
      return () => {};
    },
    onError: (e) => errors.push(e),
    onEvent: () => ac.abort(),
  });

  expect(h.connections).toHaveLength(2);
  expect(String(errors[0])).toContain("stalled");
});

test("a wake whose settle check the page slept through gives the backlog another chance", async () => {
  const clock = skewableClock();
  let retryNow: (() => void) | undefined;
  const h = await startServer((conn) => {
    setTimeout(() => {
      retryNow?.();
      clock.sleep(60_000);
    }, 20);
    setTimeout(() => conn.raw(": hb\n\n"), WAKE_SETTLE_MS + 200);
  });
  const ac = new AbortController();
  const errors: unknown[] = [];

  const run = streamGlobalEvents({
    url: () => `${h.baseUrl}/v1/events`,
    fetch,
    signal: ac.signal,
    sleep: instant,
    now: clock.now,
    wake: (fn) => {
      retryNow = fn;
      return () => {};
    },
    onError: (e) => errors.push(e),
    onEvent: () => {},
  });
  await new Promise((r) => setTimeout(r, 2 * WAKE_SETTLE_MS + 500));
  ac.abort();
  await run;

  expect(errors).toEqual([]);
  expect(h.connections).toHaveLength(1);
});
