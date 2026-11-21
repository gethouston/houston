import { expect, test } from "vitest";
import { HoustonEngineClient } from "./client";

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
  expect(bodies[0]).toEqual({ text: "hi", nonce: "n1" });
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

test("a send carries no credential field of any kind", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hi", { nonce: "n1", provider: "anthropic" });
  expect(bodies[0]).not.toHaveProperty("credentialScope");
  expect(JSON.stringify(bodies[0])).not.toContain("credential");
});

test("sendMessage carries approval receipts beside the text, not inside it", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "Delete it?: Yes, go ahead", {
    approvals: [{ requestId: "req-1", decision: "approve" }],
  });
  expect(bodies[0]).toEqual({
    text: "Delete it?: Yes, go ahead",
    approvals: [{ requestId: "req-1", decision: "approve" }],
  });
});

test("a message that answers no card carries no approvals key at all", async () => {
  const { client, bodies } = capture();
  await client.sendMessage("c1", "hello");
  expect("approvals" in (bodies[0] ?? {})).toBe(false);
});

test("sendMessage resolves with the turn id the 202 names", async () => {
  const answer = (body: string | null) =>
    new HoustonEngineClient({
      baseUrl: "http://engine.test",
      fetch: (async () => new Response(body, { status: 202 })) as typeof fetch,
    });
  await expect(
    answer('{"ok":true,"id":"c1","turnId":"t-9"}').sendMessage("c1", "hi"),
  ).resolves.toEqual({ turnId: "t-9" });
  await expect(
    answer('{"ok":true,"id":"c1"}').sendMessage("c1", "hi"),
  ).resolves.toEqual({});
  await expect(answer(null).sendMessage("c1", "hi")).resolves.toEqual({});
  await expect(answer("accepted").sendMessage("c1", "hi")).resolves.toEqual({});
});
