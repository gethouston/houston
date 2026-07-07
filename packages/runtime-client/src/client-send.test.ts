import { expect, test } from "vitest";
import { HoustonEngineClient } from "./client";

/**
 * sendMessage's POST body IS the runtime's per-turn pin contract
 * (`handleStartTurn` destructures `{ text, nonce, model, effort, provider }`):
 * a conversation's own provider/model must reach the wire on every send, or
 * the runtime silently falls back to the agent-wide settings and the chat
 * answers on a provider the user never picked in it (HOU-695).
 */
function capture() {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const client = new HoustonEngineClient({
    baseUrl: "http://engine.test",
    fetch: fetchImpl,
  });
  return { client, bodies };
}

test("sendMessage carries the per-turn pin on the wire", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hi", {
    nonce: "n1",
    provider: "openai-codex",
    model: "gpt-5.5",
    effort: "high",
  });
  expect(bodies[0]).toEqual({
    text: "hi",
    nonce: "n1",
    provider: "openai-codex",
    model: "gpt-5.5",
    effort: "high",
  });
});

test("a pin-less sendMessage omits the pin fields entirely", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hi", { nonce: "n1" });
  // JSON.stringify drops undefined values — the runtime must see NO pin keys,
  // so its `typeof x === "string"` guards leave the turn on its own resolution.
  expect(bodies[0]).toEqual({ text: "hi", nonce: "n1" });
  // The plan-mode pin is part of that contract: an unpinned send carries NO
  // `mode` key, so the runtime defaults the turn to "execute".
  expect(bodies[0]).not.toHaveProperty("mode");
});

test("sendMessage carries the per-turn plan mode on the wire", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hi", { nonce: "n1", mode: "plan" });
  expect(bodies[0]).toEqual({ text: "hi", nonce: "n1", mode: "plan" });
});

test("sendMessage carries the per-turn auto (Autopilot) mode on the wire", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hi", { nonce: "n1", mode: "auto" });
  expect(bodies[0]).toEqual({ text: "hi", nonce: "n1", mode: "auto" });
});
