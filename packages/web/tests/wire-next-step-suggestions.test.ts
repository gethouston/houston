import { HoustonClient } from "@houston/engine-adapter/client";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const { calls, reset, restore, stubRouted } = createWireCapture();
beforeEach(() => {
  installLocalStorage();
  reset();
});
afterEach(() => {
  disposeAllStreams();
  restore();
});

test("the account preference round-trips through the SDK, and a send never carries it (the host applies it)", async () => {
  let value: string | null = null;
  stubRouted((call) => {
    if (call.url.endsWith("/v1/preferences/next_step_suggestions")) {
      if (call.method === "PUT")
        value = String(JSON.parse(call.body ?? "{}").value);
      return json(200, { value });
    }
    if (call.url.endsWith("/events")) return new Response("");
    return json(202, { ok: true });
  });
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  expect(await client.getNextStepSuggestions()).toBe(true);
  expect(await client.setNextStepSuggestions(false)).toBe(false);
  expect(await client.getNextStepSuggestions()).toBe(false);
  await client.startSession("agent", {
    sessionKey: "suggestions",
    prompt: "hola",
  });
  const send = await vi.waitUntil(() =>
    calls.find((call) => call.url.endsWith("/messages")),
  );
  expect(send.url).toBe(
    "http://host/agents/agent/conversations/suggestions/messages",
  );
  expect(send.method).toBe("POST");
  expectGatewayHeaders(send);
  const { nonce } = JSON.parse(send.body ?? "{}");
  expect(typeof nonce).toBe("string");
  expect(send.body).toBe(JSON.stringify({ text: "hola", nonce }));
  // Only the two explicit reads above: the send itself reads nothing.
  expect(
    calls.filter(
      (call) =>
        call.method === "GET" &&
        call.url.endsWith("/v1/preferences/next_step_suggestions"),
    ),
  ).toHaveLength(2);
  const write = calls.find((call) => call.method === "PUT");
  expect(write?.url).toBe("http://host/v1/preferences/next_step_suggestions");
  expect(write?.body).toBe('{"value":"false"}');
  expect(await client.setNextStepSuggestions(true)).toBe(true);
});

test("a second quick send queues behind the first instead of dispatching beside it", async () => {
  stubRouted((call) => {
    // A preference read that never answers: no send may wait on one.
    if (call.url.includes("/v1/preferences/"))
      return new Promise<Response>(() => {});
    if (call.url.endsWith("/events"))
      return new Response(new ReadableStream(), {
        headers: { "content-type": "text/event-stream" },
      });
    return json(202, { ok: true, turnId: "t1" });
  });
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  await client.startSession("agent", { sessionKey: "quick", prompt: "one" });
  await client.startSession("agent", { sessionKey: "quick", prompt: "two" });
  await vi.waitUntil(() => calls.some((c) => c.url.endsWith("/messages")));
  const sends = calls.filter((call) => call.url.endsWith("/messages"));
  expect(sends.map((s) => JSON.parse(s.body ?? "{}").text)).toEqual(["one"]);
});
