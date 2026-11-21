import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";

const BASE = "http://127.0.0.1:4317";
const URL = "https://slack.com/oauth/v2/authorize?state=opaque";
const LOOPBACK = {
  kind: "loopback",
  port: 53124,
  state: "q9X-_3abcDEF4567",
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function gateway(...answers: Array<() => Response>) {
  const bodies: Array<string | null> = [];
  const fetchImpl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(typeof init?.body === "string" ? init.body : null);
      init?.signal?.throwIfAborted();
      const next = answers.shift();
      if (!next) throw new Error("no answer left");
      return next();
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const sdk = new HoustonSdk({ baseUrl: BASE, ports, reactivity: false });
  return { sdk, bodies };
}

const refusesLoopback = () => json({ code: "invalid_request" }, 400);

describe("a loopback connect the gateway refuses", () => {
  it("asks once more for the app return and says the gateway took app", async () => {
    const { sdk, bodies } = gateway(refusesLoopback, () => json({ url: URL }));
    expect(await sdk.channels.connectSlack(LOOPBACK)).toEqual({
      url: URL,
      accepted: "app",
    });
    expect(bodies).toEqual([
      '{"return":"loopback","port":53124,"state":"q9X-_3abcDEF4567"}',
      '{"return":"app"}',
    ]);
  });

  it("retries only once, so an app return refused the same way fails", async () => {
    const { sdk, bodies } = gateway(refusesLoopback, refusesLoopback);
    await expect(sdk.channels.connectSlack(LOOPBACK)).rejects.toMatchObject({
      name: "ChannelsHttpError",
      status: 400,
    });
    expect(bodies).toEqual([
      '{"return":"loopback","port":53124,"state":"q9X-_3abcDEF4567"}',
      '{"return":"app"}',
    ]);
  });
});

describe("a connect the skew retry leaves alone", () => {
  it("takes the loopback return on the first answer", async () => {
    const { sdk, bodies } = gateway(() => json({ url: URL }));
    expect(await sdk.channels.connectSlack(LOOPBACK)).toEqual({
      url: URL,
      accepted: "loopback",
    });
    expect(bodies).toHaveLength(1);
  });

  it("fails on a 400 with any other code", async () => {
    const { sdk, bodies } = gateway(() =>
      json({ code: "slack_not_configured" }, 400),
    );
    await expect(sdk.channels.connectSlack(LOOPBACK)).rejects.toMatchObject({
      status: 400,
    });
    expect(bodies).toHaveLength(1);
  });

  it("fails on another status carrying invalid_request", async () => {
    const { sdk, bodies } = gateway(() =>
      json({ code: "invalid_request" }, 422),
    );
    await expect(sdk.channels.connectSlack(LOOPBACK)).rejects.toMatchObject({
      status: 422,
    });
    expect(bodies).toHaveLength(1);
  });

  it("never retries an app or web connect", async () => {
    const app = gateway(refusesLoopback);
    await expect(
      app.sdk.channels.connectSlack({ kind: "app" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(app.bodies).toEqual(['{"return":"app"}']);
    const web = gateway(refusesLoopback);
    await expect(web.sdk.channels.connectSlack()).rejects.toMatchObject({
      status: 400,
    });
    expect(web.bodies).toEqual(["{}"]);
  });

  it("does not retry once the caller aborted", async () => {
    const controller = new AbortController();
    const { sdk, bodies } = gateway(() => {
      controller.abort();
      return refusesLoopback();
    });
    await expect(
      sdk.channels.connectSlack(LOOPBACK, controller.signal),
    ).rejects.toMatchObject({ status: 400 });
    expect(bodies).toHaveLength(1);
  });

  it("does not retry an aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { sdk, bodies } = gateway(refusesLoopback);
    await expect(
      sdk.channels.connectSlack(LOOPBACK, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(bodies).toHaveLength(1);
  });
});
