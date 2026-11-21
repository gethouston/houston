import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "a1";
const SK = "sk-1";
const HANDOFF = "0b6c3f9e-8d1a-4f2b-9c3d-5e6f7a8b9c0d";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};

function openBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const write = (text: string) =>
    controller.enqueue(new TextEncoder().encode(text));
  return { body, write, close: () => controller.close() };
}

const handlers = () => ({
  onFrame: vi.fn(),
  onPage: vi.fn(),
  onStatus: vi.fn(),
  onConnection: vi.fn(),
  onRefused: vi.fn(),
  onUnexpected: vi.fn(),
});

const posts = () => calls.filter((c: Call) => c.method === "POST");

test("openBrowserLive streams GET …/browser/live and posts byte-identical input batches", async () => {
  const stream = openBody();
  const firstAnswer = openBody();
  stubRouted((call: Call) => {
    if (call.method === "GET")
      return new Response(stream.body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    if (posts().length === 1)
      return new Response(firstAnswer.body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    return json(200, {
      state: call.body?.includes("finish") ? "done" : "waiting",
    });
  });
  const h = handlers();
  const live = client().openBrowserLive(AGENT, SK, h, { layout: "phone" });

  await vi.waitFor(() => expect(calls).toHaveLength(1));
  const get = calls[0];
  const viewer = new URL(get.url).searchParams.get("viewer") ?? "";
  expect(viewer).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(get.method).toBe("GET");
  expect(get.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/browser/live?viewer=${viewer}&layout=phone`,
  );
  expect(get.headers.get("Accept")).toBeNull();
  expect(get.headers.get("Authorization")).toBe("Bearer t");
  expect(get.headers.get("x-houston-org")).toBe(ORG);

  live.send({ type: "text", text: "hi" });
  await new Promise((r) => setTimeout(r, 20));
  expect(posts()).toHaveLength(0);
  stream.write(
    `event: status\ndata: ${JSON.stringify({ type: "status", handoffId: HANDOFF, state: "waiting", text: "Sign in", expiresAt: 1 })}\n\n`,
  );

  await vi.waitFor(() => expect(posts()).toHaveLength(1));
  stream.write(
    `event: frame\ndata: ${JSON.stringify({ type: "frame", seq: 3, jpeg: "AAA", width: 412, height: 860 })}\n\n`,
  );
  await vi.waitFor(() => expect(h.onFrame).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(posts()).toHaveLength(2));
  live.send({ type: "key", key: "Enter" });
  firstAnswer.write('{"state":"waiting"}');
  firstAnswer.close();
  await vi.waitFor(() => expect(posts()).toHaveLength(3));

  const [first, ack, second] = posts();
  expect(first.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/browser/input`,
  );
  expect(first.body).toBe(
    `{"handoff":"${HANDOFF}","events":[{"type":"text","text":"hi"}],"batch":{"viewer":"${viewer}","seq":1}}`,
  );
  expectGatewayHeaders(first);
  expect(ack.url).toBe(first.url);
  expect(ack.body).toBe(
    `{"handoff":"${HANDOFF}","ack":{"viewer":"${viewer}","seq":3}}`,
  );
  expectGatewayHeaders(ack);
  expect(second.url).toBe(first.url);
  expect(second.body).toBe(
    `{"handoff":"${HANDOFF}","events":[{"type":"key","key":"Enter"}],"batch":{"viewer":"${viewer}","seq":2}}`,
  );
  expectGatewayHeaders(second);

  await expect(live.finish("done")).resolves.toBe("answered");
  const finish = posts()[3];
  expect(finish.url).toBe(first.url);
  expect(finish.body).toBe(`{"handoff":"${HANDOFF}","finish":"done"}`);
  expectGatewayHeaders(finish);
  expect(h.onConnection).toHaveBeenLastCalledWith({
    kind: "ended",
    reason: "done",
  });
  expect(h.onUnexpected).not.toHaveBeenCalled();
});

test("a reconnect names the hand-off in the stream query", async () => {
  let gets = 0;
  stubRouted((call: Call) => {
    if (call.method !== "GET") return json(200, { state: "waiting" });
    gets += 1;
    const body =
      gets === 1
        ? `data: ${JSON.stringify({ type: "status", handoffId: HANDOFF, state: "waiting", text: "Sign in", expiresAt: 1 })}\n\n`
        : "";
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });
  const live = client().openBrowserLive(AGENT, SK, handlers());
  await vi.waitFor(() => expect(gets).toBeGreaterThanOrEqual(2), {
    timeout: 3000,
  });
  const [first, second] = calls.filter((c: Call) => c.method === "GET");
  const viewer = new URL(first.url).searchParams.get("viewer") ?? "";
  expect(second.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/browser/live?viewer=${viewer}&layout=desktop&handoff=${HANDOFF}`,
  );
  live.close();
});
