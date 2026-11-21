import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, mock } from "node:test";
import type { GatewayFetchDeps } from "../src/lib/gateway-fetch.ts";
import {
  createProductEventsPost,
  PRODUCT_EVENTS_ROUTE,
} from "../src/lib/product-analytics/post.ts";
import type { ProductAnalyticsEvent } from "../src/lib/product-analytics/wire.ts";

const GATEWAY: GatewayFetchDeps = {
  baseUrl: "https://gateway.example",
  token: () => "bearer",
  refresh: () => Promise.resolve(null),
  fetchFn: () => Promise.reject(new Error("unused: `send` is injected")),
};

const EVENTS: readonly ProductAnalyticsEvent[] = [
  {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    name: "session_started",
    ts: "2026-09-12T10:00:00.000Z",
    properties: {},
  },
];

function offline(): TypeError {
  return new TypeError("Load failed");
}

function harness(options: { gateway?: GatewayFetchDeps | null } = {}) {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const reports: Array<{ message: string; detail: unknown }> = [];
  let answer: () => Promise<Response | null> = () =>
    Promise.resolve(new Response(JSON.stringify({ rejected: [] })));

  const post = createProductEventsPost({
    gateway: () => (options.gateway === undefined ? GATEWAY : options.gateway),
    context: () => ({
      session_id: "session-1",
      app_version: "1.2.3",
      platform: "desktop",
    }),
    send: (_deps, path, init) => {
      calls.push({ path, init });
      return answer();
    },
    isOffline: (error) => error instanceof TypeError,
    report: (message, detail) => {
      reports.push({ message, detail });
    },
  });

  return {
    post: (options?: { final: boolean }) => post(EVENTS, options),
    calls,
    reports,
    reply: (next: () => Promise<Response | null>) => {
      answer = next;
    },
  };
}

describe("the product-analytics POST", () => {
  it("survives the window going away", async () => {
    const h = harness();
    strictEqual((await h.post({ final: true })).status, "ok");
    strictEqual(h.calls[0]?.path, PRODUCT_EVENTS_ROUTE);
    strictEqual(h.calls[0]?.init.keepalive, true);
    ok(h.calls[0]?.init.signal, "a hung POST must not own the pipe forever");
  });

  it("ships a normal flush without the keepalive body cap", async () => {
    const h = harness();
    strictEqual((await h.post()).status, "ok");
    strictEqual(h.calls[0]?.init.keepalive, undefined);
    ok(h.calls[0]?.init.signal, "a hung POST must not own the pipe forever");

    strictEqual((await h.post({ final: false })).status, "ok");
    strictEqual(h.calls[1]?.init.keepalive, undefined);
  });

  it("holds the batch while the app has no engine target yet", async () => {
    const h = harness({ gateway: null });
    strictEqual((await h.post()).status, "no-session");
    strictEqual(h.calls.length, 0);
    strictEqual(h.reports.length, 0, "a booting app is not a bug");
  });

  it("frees the pipe when a request times out", async () => {
    const h = harness();
    h.reply(() =>
      Promise.reject(
        Object.assign(new Error("signal timed out"), { name: "TimeoutError" }),
      ),
    );
    strictEqual((await h.post()).status, "failed");
    strictEqual(h.reports.length, 0, "the pipe's own guard is not a bug");
    h.reply(() => Promise.resolve(new Response("{}")));
    strictEqual((await h.post()).status, "ok");
    strictEqual(h.calls.length, 2);
  });

  it("reports a missing ingest route once per launch", async () => {
    const h = harness();
    h.reply(() => Promise.resolve(new Response("", { status: 404 })));
    strictEqual((await h.post()).status, "ok");
    strictEqual((await h.post()).status, "ok");
    strictEqual(h.reports.length, 1, "one report per launch, not per batch");
    ok(h.reports[0]?.message.includes("404"));
  });

  it("keeps quiet about the device being offline, loud about anything else", async () => {
    const h = harness();
    h.reply(() => Promise.reject(offline()));
    strictEqual((await h.post()).status, "failed");
    strictEqual(h.reports.length, 0, "offline is an expected state");

    h.reply(() => Promise.reject(new Error("headers is not a function")));
    strictEqual((await h.post()).status, "failed");
    strictEqual(h.reports.length, 1, "a coding bug must reach the report path");
  });

  it("reads the per-event verdicts, and reports a body it cannot parse", async () => {
    const h = harness();
    h.reply(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            rejected: [{ id: "a", reason: "invalid_timestamp" }, 7],
          }),
          { status: 202 },
        ),
      ),
    );
    const result = await h.post();
    strictEqual(result.status, "ok");
    strictEqual(result.status === "ok" ? result.rejected?.length : -1, 1);

    h.reply(() => Promise.resolve(new Response("<html>nope</html>")));
    strictEqual(
      (await h.post()).status,
      "ok",
      "a bad body is still a delivery",
    );
    strictEqual(h.reports.length, 1);
    strictEqual((await h.post()).status, "ok");
    strictEqual(h.reports.length, 1, "one report per launch, not per batch");
  });

  it("keeps quiet when the 202 body dies in transport or to the timeout", async () => {
    const h = harness();
    const dyingBody = (error: Error) =>
      Promise.resolve(
        Object.assign(new Response("", { status: 202 }), {
          json: () => Promise.reject(error),
        }),
      );
    h.reply(() => dyingBody(offline()));
    strictEqual((await h.post()).status, "ok");
    h.reply(() =>
      dyingBody(
        Object.assign(new Error("signal timed out"), { name: "TimeoutError" }),
      ),
    );
    strictEqual((await h.post()).status, "ok");
    strictEqual(h.reports.length, 0, "a dropped body read is not a bug");
  });

  it("still sends on a webview without AbortSignal.timeout", async () => {
    const original = AbortSignal.timeout;
    Reflect.deleteProperty(AbortSignal, "timeout");
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const calls: RequestInit[] = [];
      const reports: string[] = [];
      const post = createProductEventsPost({
        gateway: () => GATEWAY,
        context: () => ({
          session_id: "session-1",
          app_version: "1.2.3",
          platform: "desktop",
        }),
        send: (_deps, _path, init) => {
          calls.push(init);
          return Promise.resolve(
            new Response(JSON.stringify({ rejected: [] })),
          );
        },
        isOffline: () => false,
        report: (message) => {
          reports.push(message);
        },
      });
      strictEqual((await post(EVENTS)).status, "ok");
      strictEqual(reports.length, 0);
      const signal = calls[0]?.signal;
      ok(signal, "a hung POST must not own the pipe forever");
      mock.timers.tick(15_000);
      strictEqual(signal.aborted, true);
      strictEqual((signal.reason as Error).name, "TimeoutError");
    } finally {
      mock.timers.reset();
      AbortSignal.timeout = original;
    }
  });

  it("answers no-session when the gateway has no bearer to send", async () => {
    const h = harness();
    h.reply(() => Promise.resolve(null));
    strictEqual((await h.post()).status, "no-session");
  });
});

describe("what transport.ts wires in", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/product-analytics/transport.ts"),
    "utf8",
  );

  it("waits for the engine before reading the install id", () => {
    ok(source.includes("createInstallIdReader"));
    ok(source.includes("whenEngineReady"));
  });

  it("reports through the app's one reporting path", () => {
    ok(source.includes("reportError"));
    ok(source.includes("isNetworkTransportError"));
  });

  it("looks for a visitor id on the web surface only", () => {
    ok(source.includes("readWebVisitorId"));
    ok(
      /readVisitorId:\s*\(\)\s*=>\s*\(osIsTauri\(\)\s*\?\s*null\s*:\s*readWebVisitorId\(\)\)/.test(
        source,
      ),
      "desktop must read null, never the window's location",
    );
  });
});
