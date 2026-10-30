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

test("the account preference round-trips through the SDK and false rides the send byte for byte", async () => {
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
  expect(send.body).toBe(
    JSON.stringify({ text: "hola", nonce, nextStepSuggestions: false }),
  );
  const write = calls.find((call) => call.method === "PUT");
  expect(write?.url).toBe("http://host/v1/preferences/next_step_suggestions");
  expect(write?.body).toBe('{"value":"false"}');
  expect(await client.setNextStepSuggestions(true)).toBe(true);
});
