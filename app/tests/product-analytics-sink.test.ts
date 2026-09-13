import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { ProductAnalyticsQueue } from "../src/lib/product-analytics/queue.ts";
import { startProductAnalyticsSink } from "../src/lib/product-analytics/sink.ts";
import type { ProductAnalyticsSendResult } from "../src/lib/product-analytics/wire.ts";
import { resolveClientDeployment } from "../src/lib/sentry-deployment.ts";

function harness(hosted: boolean) {
  let seq = 0;
  const sent: string[][] = [];
  const busListeners: Array<(name: string) => void> = [];
  const hiddenHandlers: Array<() => void> = [];
  let subscribeCalls = 0;
  let onHiddenCalls = 0;

  const queue = new ProductAnalyticsQueue({
    transport: (events) => {
      sent.push(events.map((e) => e.name));
      return Promise.resolve<ProductAnalyticsSendResult>({ status: "ok" });
    },
    now: () => Date.parse("2026-09-12T10:00:00.000Z"),
    uuid: () => `id-${++seq}`,
    // Nothing must ship on a timer in these tests: only an explicit flush.
    schedule: () => () => {},
  });

  const stop = startProductAnalyticsSink({
    hosted,
    queue,
    subscribe: (listener) => {
      subscribeCalls += 1;
      busListeners.push(listener);
      return () => {
        busListeners.splice(busListeners.indexOf(listener), 1);
      };
    },
    onHidden: (handler) => {
      onHiddenCalls += 1;
      hiddenHandlers.push(handler);
      return () => {
        hiddenHandlers.splice(hiddenHandlers.indexOf(handler), 1);
      };
    },
  });

  return {
    queue,
    sent,
    stop,
    track: (name: string) => {
      for (const listener of [...busListeners]) listener(name);
    },
    goodbye: () => {
      for (const handler of [...hiddenHandlers]) handler();
    },
    counts: () => ({
      subscribe: subscribeCalls,
      onHidden: onHiddenCalls,
      listeners: busListeners.length,
      hidden: hiddenHandlers.length,
    }),
  };
}

describe("product analytics sink", () => {
  it("never subscribes to anything when the client is not hosted", async () => {
    const h = harness(false);
    deepStrictEqual(h.counts(), {
      subscribe: 0,
      onHidden: 0,
      listeners: 0,
      hidden: 0,
    });
    h.track("agent_created");
    h.goodbye();
    await h.queue.flush();
    strictEqual(h.queue.size, 0, "nothing was ever gathered");
    strictEqual(h.sent.length, 0, "nothing was ever sent");
    h.stop();
  });

  it("feeds the queue from the bus when the client is hosted", async () => {
    const h = harness(true);
    deepStrictEqual(h.counts(), {
      subscribe: 1,
      onHidden: 1,
      listeners: 1,
      hidden: 1,
    });
    h.track("agent_created");
    h.track("chat_message_sent");
    strictEqual(h.queue.size, 1, "the server owns chat_message_sent");
    await h.queue.flush();
    deepStrictEqual(h.sent, [["agent_created"]]);
  });

  it("flushes on the window's goodbye and stops on teardown", async () => {
    const h = harness(true);
    h.track("command_palette_opened");
    h.goodbye();
    await new Promise<void>((done) => setImmediate(done));
    deepStrictEqual(h.sent, [["command_palette_opened"]]);
    h.stop();
    deepStrictEqual(h.counts(), {
      subscribe: 1,
      onHidden: 1,
      listeners: 0,
      hidden: 0,
    });
    h.track("command_palette_opened");
    strictEqual(h.queue.size, 0, "a torn-down sink hears nothing");
  });
});

describe("the deployments the sink runs on", () => {
  const deployment = (
    engine: Parameters<typeof resolveClientDeployment>[0]["engine"],
    override?: string,
  ) => resolveClientDeployment({ engine, override });

  it("is on for the managed cloud, on desktop AND in the browser", () => {
    // Desktop cloud build: the baked gateway URL.
    strictEqual(
      deployment({ kind: "hosted-oauth", url: "https://gw.example" }),
      "managed-cloud",
    );
    // Cloud web build: bakes no gateway, announces itself on the override.
    strictEqual(
      deployment({ kind: "sidecar" }, "managed-cloud"),
      "managed-cloud",
    );
  });

  it("is off for a local desktop build and for self-host", () => {
    strictEqual(deployment({ kind: "sidecar" }), "desktop");
    strictEqual(
      deployment({ kind: "static-host", url: "http://127.0.0.1:4318" }),
      "desktop",
    );
    strictEqual(
      deployment({ kind: "static-host", url: "https://houston.acme.example" }),
      "selfhost",
    );
    strictEqual(deployment({ kind: "sidecar" }, "selfhost"), "selfhost");
  });
});
