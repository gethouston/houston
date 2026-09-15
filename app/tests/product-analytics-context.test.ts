import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createProductAnalyticsContext } from "../src/lib/product-analytics/context.ts";
import { ProductAnalyticsQueue } from "../src/lib/product-analytics/queue.ts";
import type {
  ProductAnalyticsContext,
  ProductAnalyticsSendResult,
} from "../src/lib/product-analytics/wire.ts";

const INSTALL_ID = "8f0c3b1a-2d4e-4a6b-9c8d-7e5f4a3b2c1d";

function harness() {
  let reads = 0;
  let resolveRead: (id: string) => void = () => {};
  let rejectRead: (error: unknown) => void = () => {};
  const failures: unknown[] = [];

  const context = createProductAnalyticsContext({
    sessionId: () => "session-1",
    appVersion: "1.2.3",
    platform: () => "desktop",
    readInstallId: () => {
      reads += 1;
      return new Promise<string>((resolve, reject) => {
        resolveRead = resolve;
        rejectRead = reject;
      });
    },
    onInstallIdFailure: (error) => {
      failures.push(error);
    },
  });

  /** Let the resolved read's continuation run before the next assertion. */
  const settle = () => new Promise<void>((done) => setImmediate(done));

  return {
    context,
    failures,
    settle,
    reads: () => reads,
    answer: async (id = INSTALL_ID) => {
      resolveRead(id);
      await settle();
    },
    refuse: async (
      error: unknown = options?.failWith ?? new Error("no store"),
    ) => {
      rejectRead(error);
      await settle();
    },
  };
}

describe("the product-analytics batch context", () => {
  it("ships without an install id until the store answers", async () => {
    const h = harness();
    deepStrictEqual(h.context(), {
      session_id: "session-1",
      app_version: "1.2.3",
      platform: "desktop",
    });
    ok(
      !Object.hasOwn(h.context(), "install_id"),
      "an unresolved id is absent, never null or empty",
    );

    await h.answer();
    deepStrictEqual(h.context(), {
      session_id: "session-1",
      app_version: "1.2.3",
      platform: "desktop",
      install_id: INSTALL_ID,
    });
  });

  it("reads the install id once, however many batches ship", async () => {
    const h = harness();
    h.context();
    h.context();
    strictEqual(h.reads(), 1, "the read starts on the first batch, and once");
    await h.answer();
    h.context();
    h.context();
    strictEqual(h.reads(), 1, "a resolved id is never read again");
  });

  it("reports a refused read and keeps sending batches without the id", async () => {
    const failure = new Error("preferences unavailable");
    const h = harness();
    h.context();
    await h.refuse(failure);
    deepStrictEqual(h.failures, [failure], "a refused read reaches Sentry");
    ok(!Object.hasOwn(h.context(), "install_id"));
    strictEqual(
      h.reads(),
      1,
      "one attempt per launch, so one report per launch",
    );
  });

  it("asks for the session id and platform fresh on every batch", async () => {
    let session = "first";
    let desktop = true;
    const context = createProductAnalyticsContext({
      sessionId: () => session,
      appVersion: "1.2.3",
      platform: () => (desktop ? "desktop" : "web"),
      readInstallId: () => Promise.resolve(INSTALL_ID),
      onInstallIdFailure: () => {},
    });
    strictEqual(context().session_id, "first");
    session = "second";
    desktop = false;
    strictEqual(context().session_id, "second");
    strictEqual(context().platform, "web");
  });
});

describe("what the gateway receives", () => {
  /** The real posting shape: one context, built when the batch leaves. */
  function batching(context: () => ProductAnalyticsContext) {
    const bodies: Array<{ context: ProductAnalyticsContext; names: string[] }> =
      [];
    const queue = new ProductAnalyticsQueue({
      transport: (events) => {
        bodies.push({
          context: context(),
          names: events.map((event) => event.name),
        });
        return Promise.resolve<ProductAnalyticsSendResult>({ status: "ok" });
      },
      schedule: () => () => {},
    });
    return { bodies, queue };
  }

  it("carries the install id from the first batch that knows it", async () => {
    const h = harness();
    const { bodies, queue } = batching(h.context);

    queue.enqueue("onboarding_started", { source: "in_app" });
    await queue.flush();
    await h.answer();
    queue.enqueue("onboarding_completed");
    await queue.flush();

    deepStrictEqual(
      bodies.map((body) => body.names),
      [["onboarding_started"], ["onboarding_completed"]],
    );
    strictEqual(bodies[0]?.context.install_id, undefined);
    strictEqual(bodies[1]?.context.install_id, INSTALL_ID);
  });
});
