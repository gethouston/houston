import { test, expect } from "bun:test";
import { createServer, type Server } from "node:http";
import { complete, getModels } from "@earendil-works/pi-ai";
import { createKeylessProxy } from "./keyless-proxy";

/**
 * De-risks the cloud "keyless proxy" (Cloud Plan §5) in two halves:
 *
 *  A. pi-ai is fully redirectable and can run with ONLY a credential we choose —
 *     so a sandbox can talk to a control plane proxy instead of the real provider, holding
 *     no real key. (Driven through REAL pi-ai.)
 *  B. The proxy injects the real key and forwards upstream — so the real key
 *     never enters the sandbox. (Driven through the REAL proxy module.)
 */

function listen(server: Server): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test("A) pi-ai runs keyless: model.baseUrl is redirectable and carries only the credential we supply", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, unknown> = {};

  // Stand in for the control plane proxy: capture what pi-ai sends, then fail fast (400 →
  // the Anthropic SDK throws without retrying, so the test never hangs).
  const capture = createServer((req, res) => {
    capturedUrl = req.url ?? "";
    capturedHeaders = req.headers;
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "de-risk stop" } }));
  });
  const cap = await listen(capture);

  // Take a real Anthropic model and repoint it at our endpoint (== the proxy in prod).
  const model = { ...getModels("anthropic")[0], baseUrl: cap.url };

  await complete(
    model,
    { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] },
    { apiKey: "sandbox-token-abc", maxRetries: 0 },
  ).catch(() => {}); // the 400 rejects; we assert on what was sent

  expect(capturedUrl).toContain("/v1/messages"); // pi-ai hit OUR url, not api.anthropic.com
  const auth = `${capturedHeaders["x-api-key"] ?? ""} ${capturedHeaders["authorization"] ?? ""}`;
  expect(auth).toContain("sandbox-token-abc"); // only the credential WE supplied — no real key needed

  await cap.close();
});

test("B) the keyless proxy injects the real key; the sandbox never holds it", async () => {
  const REAL_KEY = "sk-real-anthropic-key-DO-NOT-LEAK";
  const SANDBOX_TOKEN = "cp-issued-sandbox-token";

  let upstreamSawKey: string | undefined = "(unset)";
  const upstream = createServer(async (req, res) => {
    upstreamSawKey = req.headers["x-api-key"] as string | undefined;
    for await (const _ of req) { /* drain */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const up = await listen(upstream);

  const proxy = createKeylessProxy({
    upstream: up.url,
    realKey: REAL_KEY,
    validateSandboxToken: (t) => t === SANDBOX_TOKEN,
  });
  const px = await listen(proxy);

  // Sandbox → proxy, carrying ONLY the control plane token (never the real key).
  const ok = await fetch(`${px.url}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": SANDBOX_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ model: "claude" }),
  });
  expect(ok.status).toBe(200);
  expect(upstreamSawKey).toBe(REAL_KEY); // proxy injected the real key
  expect(upstreamSawKey).not.toBe(SANDBOX_TOKEN); // sandbox token never reached upstream

  // A forged / missing token is rejected before any upstream call.
  const forged = await fetch(`${px.url}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": "forged", "content-type": "application/json" },
    body: "{}",
  });
  expect(forged.status).toBe(401);

  await px.close();
  await up.close();
});
