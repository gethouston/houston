import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createInstallIdReader,
  createProductAnalyticsContext,
} from "../src/lib/product-analytics/context.ts";
import { ProductAnalyticsQueue } from "../src/lib/product-analytics/queue.ts";
import type {
  ProductAnalyticsContext,
  ProductAnalyticsSendResult,
} from "../src/lib/product-analytics/wire.ts";

const INSTALL_ID = "8f0c3b1a-2d4e-4a6b-9c8d-7e5f4a3b2c1d";
const VISITOR_ID = "2b0f7a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c";

function harness(options: { visitorId?: string } = {}) {
  let reads = 0;
  let resolveRead: (id: string) => void = () => {};

  const context = createProductAnalyticsContext({
    sessionId: () => "session-1",
    appVersion: "1.2.3",
    platform: () => "desktop",
    readInstallId: () => {
      reads += 1;
      return new Promise<string>((resolve) => {
        resolveRead = resolve;
      });
    },
    readVisitorId: () => options.visitorId ?? null,
  });

  /** Let the resolved read's continuation run before the next assertion. */
  const settle = () => new Promise<void>((done) => setImmediate(done));

  return {
    context,
    settle,
    reads: () => reads,
    answer: async (id = INSTALL_ID) => {
      resolveRead(id);
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

  it("asks for the session id and platform fresh on every batch", async () => {
    let session = "first";
    let desktop = true;
    const context = createProductAnalyticsContext({
      sessionId: () => session,
      appVersion: "1.2.3",
      platform: () => (desktop ? "desktop" : "web"),
      readInstallId: () => Promise.resolve(INSTALL_ID),
      readVisitorId: () => null,
    });
    strictEqual(context().session_id, "first");
    session = "second";
    desktop = false;
    strictEqual(context().session_id, "second");
    strictEqual(context().platform, "web");
  });
});

describe("the install id the batches carry", () => {
  it("never reads the store before the engine is ready", async () => {
    let reads = 0;
    const readInstallId = createInstallIdReader({
      // An engine that never bootstraps: offline before sign-in, with the sink
      // already listening above <EngineGate>.
      whenEngineReady: () => new Promise<void>(() => {}),
      readStoredId: () => {
        reads += 1;
        return Promise.resolve(INSTALL_ID);
      },
    });
    const context = createProductAnalyticsContext({
      sessionId: () => "session-1",
      appVersion: "1.2.3",
      platform: () => "desktop",
      readInstallId,
      readVisitorId: () => null,
    });

    context();
    await new Promise<void>((done) => setImmediate(done));
    // Reading early MINTS one (`lib/install-id.ts` swallows the store failure),
    // and a fabricated id would re-fire install_created and re-open the welcome
    // bridge for a device that was never new.
    strictEqual(reads, 0, "a flush before the engine must mint nothing");
    ok(
      !Object.hasOwn(context(), "install_id"),
      "the batch ships without an id rather than with an invented one",
    );
  });

  it("reads the stored id once the engine is up", async () => {
    let ready: () => void = () => {};
    const readInstallId = createInstallIdReader({
      whenEngineReady: () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
      readStoredId: () => Promise.resolve(INSTALL_ID),
    });
    const id = readInstallId();
    ready();
    strictEqual(await id, INSTALL_ID);
  });
});

describe("the visitor id the batches carry", () => {
  it("rides the very first batch", () => {
    // Unlike the install id: it comes out of the boot URL, so it is known
    // before any event exists — and the first batch is the one an acquisition
    // funnel is counting.
    const h = harness({ visitorId: VISITOR_ID });
    deepStrictEqual(h.context(), {
      session_id: "session-1",
      app_version: "1.2.3",
      platform: "desktop",
      visitor_id: VISITOR_ID,
    });
  });

  it("is absent, never null, on a visit that brought none", () => {
    // Desktop, and any web visit that did not arrive through a site link.
    const h = harness();
    ok(!Object.hasOwn(h.context(), "visitor_id"));
  });

  it("is read on every batch, not captured once here", () => {
    // The capture (and the one-time URL strip) belongs to
    // `web-visitor-landing.ts`; this only asks it.
    let visitor: string | null = null;
    const context = createProductAnalyticsContext({
      sessionId: () => "session-1",
      appVersion: "1.2.3",
      platform: () => "web",
      readInstallId: () => Promise.resolve(INSTALL_ID),
      readVisitorId: () => visitor,
    });
    strictEqual(context().visitor_id, undefined);
    visitor = VISITOR_ID;
    strictEqual(context().visitor_id, VISITOR_ID);
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

  it("carries the visitor id from the batch the launch starts with", async () => {
    const h = harness({ visitorId: VISITOR_ID });
    const { bodies, queue } = batching(h.context);

    queue.enqueue("session_started");
    await queue.flush();

    // The install id is still a hop away; the visitor id is already there, so
    // a visit that signs in and does nothing else still joins the funnel.
    strictEqual(bodies[0]?.context.install_id, undefined);
    strictEqual(bodies[0]?.context.visitor_id, VISITOR_ID);
  });
});
