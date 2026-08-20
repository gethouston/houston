import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { attachViewCapture, viewForPath } from "./view-capture";

test("viewForPath matches exactly the three view routes", () => {
  expect(viewForPath("/agents/a1/providers")).toEqual({
    agentId: "a1",
    family: "providers",
  });
  expect(viewForPath("/agents/a%20b/providers/usage")).toEqual({
    agentId: "a b",
    family: "provider_usage",
  });
  expect(viewForPath("/agents/a1/integrations/custom/definitions")).toEqual({
    agentId: "a1",
    family: "custom_definitions",
  });
  expect(viewForPath("/agents/a1/skills")).toEqual({
    agentId: "a1",
    family: "skills",
  });
  expect(viewForPath("/agents/a1/skills/my-skill")).toBeNull();
  expect(viewForPath("/agents/a1/providers/openai")).toBeNull();
  expect(viewForPath("/agents/a1/conversations")).toBeNull();
  expect(viewForPath("/providers")).toBeNull();
});

async function serveOnce(
  handler: (res: import("node:http").ServerResponse) => void,
): Promise<{ captured: unknown[]; body: string; status: number }> {
  const captured: unknown[] = [];
  const server = createServer((_req, res) => {
    attachViewCapture(res, (json) => captured.push(json));
    handler(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/x`);
  const body = await response.text();
  await new Promise((r) => server.close(r));
  // The finish event fires after the response is flushed; yield once.
  await new Promise((r) => setImmediate(r));
  return { captured, body, status: response.status };
}

test("a 200 JSON body is captured verbatim and still served to the client", async () => {
  const { captured, body } = await serveOnce((res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"providers":');
    res.end('[{"id":"anthropic","configured":true}]}');
  });
  expect(body).toBe('{"providers":[{"id":"anthropic","configured":true}]}');
  expect(captured).toEqual([
    { providers: [{ id: "anthropic", configured: true }] },
  ]);
});

test("non-200, non-JSON, and oversized bodies never publish", async () => {
  const err = await serveOnce((res) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end('{"error":"pod gone"}');
  });
  expect(err.captured).toEqual([]);

  const text = await serveOnce((res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hello, not json");
  });
  expect(text.captured).toEqual([]);

  const big = await serveOnce((res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ blob: "x".repeat(5 * 1024 * 1024) }));
  });
  expect(big.captured).toEqual([]);
  expect(big.body.length).toBeGreaterThan(5 * 1024 * 1024);
});
