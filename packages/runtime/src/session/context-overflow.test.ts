import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-ctx-"));
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");
const { setCustomEndpointConfig, OPENAI_COMPATIBLE } = await import(
  "../ai/openai-compatible"
);
const { setSettings } = await import("../ai/providers");
const { authStorage } = await import("../auth/storage");

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
