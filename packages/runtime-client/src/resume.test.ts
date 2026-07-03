import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { HoustonEngineClient } from "./client";
import { formatSseFrame } from "./replay";
import { streamEventsResumable } from "./resume";
import { FatalResumeError, type ResumeRetryInfo } from "./resume-contract";
import type { WireFrame } from "./types";

/**
 * The resumable wrapper against a REAL local SSE server: each test scripts the
 * server's behavior per connection (frames, drops, silence) and asserts what
 * the client sends back on reconnect (`?after=` cursor) and what the caller
 * observes (frames in order, resync, state changes).
 */

type Conn = {
  res: ServerResponse;
  /** The `?after=` resume cursor this connection arrived with (null = none). */
  after: string | null;
  lastEventId: string | undefined;
  send(type: string, data: unknown, seq?: number): void;
  comment(text: string): void;
};

type Harness = {
  baseUrl: string;
  connections: Conn[];
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

/**
 * Start an SSE server that hands each incoming events connection to `script`.
 * `statusFor` (per connection index) can refuse a connection with an HTTP
 * error instead — the fatal-classification tests use it.
 */
async function startServer(
  script: (conn: Conn, index: number) => void,
  statusFor?: (index: number) => number,
): Promise<Harness> {
  const connections: Conn[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const status = statusFor?.(connections.length) ?? 200;
    if (status !== 200) {
      connections.push({
        res,
        after: url.searchParams.get("after"),
        lastEventId: req.headers["last-event-id"] as string | undefined,
        send: () => {},
        comment: () => {},
      });
      res.writeHead(status, { "Content-Type": "text/plain" });
      res.end("refused");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": connected\n\n");
    const conn: Conn = {
      res,
      after: url.searchParams.get("after"),
      lastEventId: req.headers["last-event-id"] as string | undefined,
      send: (type, data, seq) =>
        res.write(formatSseFrame({ type, data, seq } as WireFrame)),
      comment: (text) => res.write(`: ${text}\n\n`),
    };
    connections.push(conn);
    script(conn, connections.length - 1);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, connections };
}

function clientFor(h: Harness): HoustonEngineClient {
  return new HoustonEngineClient({ baseUrl: h.baseUrl });
}

/** Collect frames; abort the subscription when a `done` frame arrives. */
function collectUntilDone(ac: AbortController) {
  const frames: WireFrame[] = [];
  return {
    frames,
    onEvent: (f: WireFrame) => {
      frames.push(f);
      if (f.type === "done") ac.abort();
    },
  };
}

const instant = { initialMs: 1, maxMs: 4, jitter: () => 0 };

test("a dropped connection reconnects with after=<last seq> and replays gap/dupe-free", async () => {
  const h = await startServer((conn, i) => {
    if (i === 0) {
      conn.send("sync", { running: true, partial: "", seq: 0 }, 0);
      conn.send("text", "a", 1);
      conn.send("text", "b", 2);
      conn.res.end(); // server closes mid-turn — NOT a terminal frame
    } else {
      conn.send("text", "c", 3);
      conn.send("done", null, 4);
    }
  });
  const ac = new AbortController();
  const { frames, onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections).toHaveLength(2);
  expect(h.connections[0]?.after).toBeNull();
  expect(h.connections[1]?.after).toBe("2"); // exactly the last seen seq
  expect(frames.map((f) => [f.type, f.seq])).toEqual([
    ["sync", 0],
    ["text", 1],
    ["text", 2],
    ["text", 3],
    ["done", 4],
  ]);
});

test("an unserviceable cursor resyncs: the resync sync is delivered and its seq becomes the cursor", async () => {
  const h = await startServer((conn, i) => {
    if (i === 0) {
      conn.send("sync", { running: true, partial: "", seq: 0 }, 0);
      conn.send("text", "a", 1);
      conn.res.end();
    } else if (i === 1) {
      // Cursor 1 is too old (buffer cleared): resync with the current watermark.
      conn.send(
        "sync",
        { running: false, partial: "", seq: 9, resync: true },
        9,
      );
      conn.res.end();
    } else {
      conn.send("done", null, 10);
    }
  });
  const ac = new AbortController();
  const { frames, onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections[1]?.after).toBe("1");
  expect(h.connections[2]?.after).toBe("9"); // adopted from the resync sync
  // The resync sync frame itself reaches the caller (it reads `data.resync`).
  expect(frames.map((f) => f.type)).toEqual(["sync", "text", "sync", "done"]);
  expect(
    frames.filter((f) => f.type === "sync" && f.data.resync === true),
  ).toHaveLength(1);
});

test("the idle watchdog force-closes a silent connection and resumes with the cursor", async () => {
  const h = await startServer((conn, i) => {
    if (i === 0) {
      conn.send("sync", { running: true, partial: "", seq: 0 }, 0);
      conn.send("text", "a", 1);
      // then: total silence — no heartbeat, no close.
    } else {
      conn.send("done", null, 2);
    }
  });
  const ac = new AbortController();
  const { frames, onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 100,
    backoff: instant,
  });

  expect(h.connections).toHaveLength(2);
  expect(h.connections[1]?.after).toBe("1");
  expect(frames.map((f) => f.type)).toEqual(["sync", "text", "done"]);
});

test("heartbeat comments hold the watchdog off — no spurious reconnect", async () => {
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const h = await startServer((conn) => {
    conn.send("text", "a", 1);
    heartbeat = setInterval(() => conn.comment("hb"), 30);
    setTimeout(() => {
      clearInterval(heartbeat);
      conn.send("done", null, 2);
    }, 400);
  });
  cleanups.push(async () => clearInterval(heartbeat));
  const ac = new AbortController();
  const { frames, onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 120, // > heartbeat interval, < the 400ms to `done`
    backoff: instant,
  });

  expect(h.connections).toHaveLength(1);
  expect(frames.map((f) => f.type)).toEqual(["text", "done"]);
});

test("a legacy server (frames without seq) reconnects with NO cursor", async () => {
  const h = await startServer((conn, i) => {
    if (i === 0) {
      conn.send("sync", { running: true, partial: "" }); // no seq anywhere
      conn.send("text", "a");
      conn.res.end();
    } else {
      conn.send("done", null);
    }
  });
  const ac = new AbortController();
  const { frames, onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections).toHaveLength(2);
  expect(h.connections[1]?.after).toBeNull();
  expect(h.connections[1]?.lastEventId).toBeUndefined();
  expect(frames.map((f) => f.type)).toEqual(["sync", "text", "done"]);
});

test("backoff doubles per silent failure and resets after a delivered frame", async () => {
  const h = await startServer((conn, i) => {
    if (i === 2) {
      conn.send("text", "a", 1);
      conn.res.end();
    } else if (i === 4) {
      conn.send("done", null, 2);
    } else {
      conn.res.end(); // connect "succeeds" but delivers no frame
    }
  });
  const ac = new AbortController();
  const { onEvent } = collectUntilDone(ac);
  const caps: number[] = [];

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    idleTimeoutMs: 5_000,
    backoff: {
      initialMs: 10,
      maxMs: 40,
      jitter: (capMs) => {
        caps.push(capMs);
        return 0;
      },
    },
  });

  expect(h.connections).toHaveLength(5);
  // 10 → 20 (two frameless attempts), reset to 10 by conn 2's frame, → 20.
  expect(caps).toEqual([10, 20, 10, 20]);
});

test("a throwing onEvent handler rejects the subscription — no silent retry loop", async () => {
  const h = await startServer((conn) => {
    conn.send("text", "a", 1);
  });
  const ac = new AbortController();

  await expect(
    streamEventsResumable(clientFor(h), "c1", {
      signal: ac.signal,
      onEvent: () => {
        throw new Error("handler boom");
      },
      idleTimeoutMs: 5_000,
      backoff: instant,
    }),
  ).rejects.toThrow("handler boom");
  expect(h.connections).toHaveLength(1);
  ac.abort();
});

test("a 401 is fatal: the loop stops and rejects with FatalResumeError", async () => {
  const h = await startServer(
    (conn) => {
      conn.send("text", "a", 1);
      conn.res.end();
    },
    (i) => (i === 1 ? 401 : 200),
  );
  const ac = new AbortController();
  const retries: ResumeRetryInfo[] = [];

  const run = streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent: () => {},
    onRetry: (info) => retries.push(info),
    idleTimeoutMs: 5_000,
    backoff: instant,
  });
  await expect(run).rejects.toBeInstanceOf(FatalResumeError);
  await expect(run).rejects.toMatchObject({ status: 401 });

  expect(h.connections).toHaveLength(2); // no third attempt after the refusal
  expect(retries).toEqual([]); // fatal is not "retrying" — it stops
  ac.abort();
});

test("a transient 500 keeps retrying and reports each frameless attempt via onRetry", async () => {
  const h = await startServer(
    (conn, i) => {
      if (i === 2) {
        conn.send("text", "a", 1); // a delivered frame resets the failure count
        conn.res.end();
      } else if (i === 3) {
        conn.res.end(); // frameless again: the count restarts at 1
      } else {
        conn.send("done", null, 2);
      }
    },
    (i) => (i < 2 ? 500 : 200),
  );
  const ac = new AbortController();
  const { onEvent } = collectUntilDone(ac);
  const retries: ResumeRetryInfo[] = [];

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    onRetry: (info) => retries.push(info),
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections).toHaveLength(5);
  expect(retries.map((r) => r.consecutiveFailures)).toEqual([1, 2, 1]);
  // The 500s surfaced their EngineError; the clean frameless close had none.
  expect(retries[0]?.error).toMatchObject({ status: 500 });
  expect(retries[2]?.error).toBeUndefined();
});

test("aborting from onRetry (a failure budget) stops the loop without another attempt", async () => {
  const h = await startServer((conn) => conn.res.end());
  const ac = new AbortController();

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent: () => {},
    onRetry: ({ consecutiveFailures }) => {
      if (consecutiveFailures >= 3) ac.abort();
    },
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections).toHaveLength(3);
});

test("an initial `after` cursor rides the very first connect (subscription handoff)", async () => {
  const h = await startServer((conn) => {
    conn.send("done", null, 8);
  });
  const ac = new AbortController();
  const { onEvent } = collectUntilDone(ac);

  await streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent,
    after: 7,
    idleTimeoutMs: 5_000,
    backoff: instant,
  });

  expect(h.connections[0]?.after).toBe("7");
});

test("aborting during the backoff wait resolves promptly", async () => {
  const h = await startServer((conn) => conn.res.end());
  const ac = new AbortController();
  const started = Date.now();

  const run = streamEventsResumable(clientFor(h), "c1", {
    signal: ac.signal,
    onEvent: () => {},
    idleTimeoutMs: 5_000,
    backoff: { initialMs: 60_000, maxMs: 60_000, jitter: (cap) => cap },
  });
  setTimeout(() => ac.abort(), 50);
  await run;

  expect(Date.now() - started).toBeLessThan(2_000);
});
