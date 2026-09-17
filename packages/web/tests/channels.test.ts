import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, expect, test, vi } from "vitest";

const status = {
  providers: [{ id: "slack", name: "Slack", configured: true }],
  connections: [],
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  vi.restoreAllMocks();
});

test("channels mixin uses live authenticated current-space gateway transport", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: {
        baseUrl: "https://gateway.test",
        token: "live-token",
      },
      __HOUSTON_CP__: true,
    },
  });
  const calls: {
    url: string;
    method: string;
    org: string | null;
    auth: string | null;
  }[] = [];
  const connection = {
    id: "connection-1",
    provider: "slack",
    accountLabel: "Ada",
    spaceId: "personal",
    createdAt: "2026-09-08T12:00:00Z",
  };
  const responses: unknown[] = [
    status,
    { url: "https://slack.com/oauth/v2/authorize?state=opaque" },
    { connection },
    { code: "ABCD-1234", expiresAt: "2026-09-08T13:00:00Z" },
  ];
  globalThis.fetch = vi.fn(async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      org: headers.get("x-houston-org"),
      auth: headers.get("Authorization"),
    });
    return responses.length
      ? Response.json(responses.shift())
      : new Response(null, { status: 204 });
  });
  const client = new HoustonClient({
    baseUrl: "https://gateway.test",
    token: "stale-token",
    controlPlane: true,
  });
  client.setActiveOrg("0123456789abcdef");
  expect(await client.getChannels()).toEqual(status);
  await client.connectSlack();
  expect(await client.completeSlack("Tk7-ticket.value_~9")).toEqual(connection);
  await client.linkSlack();
  client.setActiveOrg(null);
  await client.disconnectChannel("connection/a");
  expect(calls.map(({ url, method }) => [method, url])).toEqual([
    ["GET", "https://gateway.test/v1/channels"],
    ["POST", "https://gateway.test/v1/channels/slack/connect"],
    ["POST", "https://gateway.test/v1/channels/slack/complete"],
    ["POST", "https://gateway.test/v1/channels/slack/link"],
    ["DELETE", "https://gateway.test/v1/channels/connections/connection%2Fa"],
  ]);
  expect(calls.every((call) => call.auth === "Bearer live-token")).toBe(true);
  expect(
    calls.slice(0, 4).every((call) => call.org === "0123456789abcdef"),
  ).toBe(true);
  expect(calls[4].org).toBe(null);
});

test("a local deployment exposes channels as unsupported without a network request", async () => {
  const fetch = vi.fn();
  globalThis.fetch = fetch;
  const client = new HoustonClient({
    baseUrl: "http://localhost:4318",
    token: "local",
    controlPlane: false,
  });
  await expect(client.getChannels()).rejects.toMatchObject({ status: 501 });
  expect(fetch).not.toHaveBeenCalled();
});

test("gateway deployment errors preserve their typed reason", async () => {
  globalThis.fetch = vi.fn(async () =>
    Response.json(
      { error: { code: "not_configured", message: "Slack unavailable" } },
      { status: 503 },
    ),
  );
  const client = new HoustonClient({
    baseUrl: "https://gateway.test",
    token: "token",
    controlPlane: true,
  });
  await expect(client.connectSlack()).rejects.toMatchObject({
    status: 503,
    body: { error: { code: "not_configured" } },
  });
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("a space-switch abort reaches the hosted OAuth request without retry", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  globalThis.fetch = vi.fn((_url, init) => {
    receivedSignal = init?.signal;
    started();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Scope changed", "AbortError")),
        { once: true },
      );
    });
  });
  const client = new HoustonClient({
    baseUrl: "https://gateway.test",
    token: "token",
    controlPlane: true,
  });
  const pending = client.connectSlack(controller.signal);
  await ready;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(receivedSignal).toBe(controller.signal);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
