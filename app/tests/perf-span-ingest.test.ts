import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { GatewayFetchDeps } from "../src/lib/gateway-fetch.ts";
import { createPerfSpanSend } from "../src/lib/perf-span-ingest.ts";

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function ingest(responses: Response[], token: string | null = "perf-tok") {
  const sent: Sent[] = [];
  const gateway: GatewayFetchDeps = {
    baseUrl: "https://gw.example/",
    token: () => token ?? undefined,
    refresh: async () => null,
    org: () => "acme",
    appVersion: () => null,
    fetchFn: async (input, init) => {
      sent.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body)),
      });
      return responses.shift() ?? new Response(null, { status: 204 });
    },
  };
  const send = createPerfSpanSend({
    gateway,
    platform: "macos",
    appVersion: "1.0.23",
  });
  return { send, sent };
}

describe("client-metrics ingest POST", () => {
  it("posts the batch with the bearer, no org pin, each span stamped", async () => {
    const { send, sent } = ingest([new Response(null, { status: 204 })]);
    await send([{ span: "app_to_board", ms: 1200 }]);
    deepStrictEqual(sent, [
      {
        url: "https://gw.example/v1/client-metrics",
        method: "POST",
        headers: {
          authorization: "Bearer perf-tok",
          "content-type": "application/json",
        },
        body: {
          spans: [
            {
              span: "app_to_board",
              ms: 1200,
              platform: "macos",
              appVersion: "1.0.23",
            },
          ],
        },
      },
    ]);
  });

  it("throws before any request while there is no session, so the batch re-queues", async () => {
    const { send, sent } = ingest([], null);
    await rejects(send([{ span: "app_to_board", ms: 1 }]), /session not ready/);
    strictEqual(sent.length, 0);
  });

  it("treats a 404 (an older gateway) as delivered", async () => {
    const { send } = ingest([new Response(null, { status: 404 })]);
    await send([{ span: "card_click_to_chat", ms: 3 }]);
  });

  it("throws on any other refusal, so the batch re-queues", async () => {
    const { send } = ingest([new Response(null, { status: 503 })]);
    await rejects(send([{ span: "card_click_to_chat", ms: 3 }]), /503/);
  });
});
