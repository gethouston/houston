import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

// Isolate this file's runtime state BEFORE the dynamic imports: config reads
// the env at import time, and vitest gives each test file its own module
// registry, so the endpoint/auth/settings writes stay out of ~/.houston-ts.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-ctx-"));
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");
const { setCustomEndpointConfig, OPENAI_COMPATIBLE } = await import(
  "../ai/openai-compatible"
);
const { setSettings } = await import("../ai/providers");
const { authStorage } = await import("../auth/storage");

// The llama.cpp rejection from the production incident: a Jan custom endpoint
// (n_ctx=8192) behind a tunnel answered every turn of an overgrown
// conversation with this 400, and the chat rendered the generic "Something
// unexpected happened" card because nothing classified it. llama.cpp wraps
// the payload in the OpenAI `{"error": {…}}` envelope; the openai SDK unwraps
// it and pi flattens it to `400: {"code":400,…}` — the exact errorMessage the
// classifier saw in production.
const JAN_OVERFLOW_BODY = JSON.stringify({
  error: {
    code: 400,
    message:
      "request (15246 tokens) exceeds the available context size (8192 tokens), try increasing it",
    type: "exceed_context_size_error",
    n_prompt_tokens: 15246,
    n_ctx: 8192,
  },
});

test("a turn rejected by the endpoint for context overflow persists a typed error AND teaches the endpoint its real window", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JAN_OVERFLOW_BODY);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  try {
    setCustomEndpointConfig({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: "Jan-v3.5-4B-Q4_K_XL",
    });
    // pi resolves a request's key by model.provider — a keyless local server
    // still needs the placeholder credential (auth/login.ts writes the same).
    authStorage.set(OPENAI_COMPATIBLE, {
      type: "api_key",
      key: "houston-local",
    });
    setSettings({ activeProvider: OPENAI_COMPATIBLE });

    await runTurn("conv-ctx-1", "hello");

    const [, assistant] = getHistory("conv-ctx-1")?.messages ?? [];
    expect(assistant?.providerError).toMatchObject({
      kind: "context_overflow",
      provider: OPENAI_COMPATIBLE,
      context_window_tokens: 8192,
      prompt_tokens: 15246,
    });

    // The overflow named the endpoint's REAL window (n_ctx) — it must now be
    // persisted so the next turn's autocompact divides by 8192, not the
    // assumed default that let the conversation overflow in the first place.
    const endpoint = JSON.parse(
      readFileSync(
        join(process.env.HOUSTON_DATA_DIR as string, "custom-endpoint.json"),
        "utf8",
      ),
    );
    expect(endpoint.contextWindow).toBe(8192);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
