import { mkdtempSync, readdirSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routineRunPreamble } from "@houston/domain";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

/**
 * The pi half of the routine overflow: a shared routine chat on a pi provider
 * whose session holds more than the model's window, driven through the
 * standing server's real turn path and the REAL pi session store. Only the
 * provider is simulated — an OpenAI-compatible endpoint that sizes every
 * request (4 characters ≈ 1 token) and refuses one over its window with
 * llama.cpp's own overflow body, the way a small local model does.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-rovp-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");
const { setCustomEndpointConfig, OPENAI_COMPATIBLE } = await import(
  "../ai/openai-compatible"
);
const { setSettings } = await import("../ai/providers");
const { authStorage } = await import("../auth/storage");
const { config } = await import("../config");

const WINDOW = 48_000;
const PROMPT = `${routineRunPreamble("Stock report")}Export today's stock levels and note anything below its reorder point.`;

/** The endpoint's view of each request: its size and whether it was refused. */
const endpoint = {
  replyChars: 400,
  requests: [] as { tokens: number; refused: boolean; body: string }[],
};

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
  });

const server = createServer((req, res) => {
  void read(req).then((body) => {
    const tokens = Math.ceil(body.length / 4);
    const refused = tokens > WINDOW;
    endpoint.requests.push({ tokens, refused, body });
    if (refused) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 400,
            message: `request (${tokens} tokens) exceeds the available context size (${WINDOW} tokens), try increasing it`,
            type: "exceed_context_size_error",
            n_prompt_tokens: tokens,
            n_ctx: WINDOW,
          },
        }),
      );
      return;
    }
    // Varied rows, 19 characters each: one identical row repeated would read
    // as a repetition loop and be cut (session/runaway-output.ts).
    const rows = Array.from(
      { length: Math.ceil(endpoint.replyChars / 19) },
      (_, i) =>
        `SKU-${String(i % 10_000).padStart(4, "0")} ${10 + (i % 90)} units; `,
    );
    const reply = `Stock export: ${rows.join("")}`;
    const chunk = (data: object) => `data: ${JSON.stringify(data)}\n\n`;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      chunk({
        choices: [{ index: 0, delta: { content: reply }, finish_reason: null }],
      }),
    );
    res.write(
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
    );
    res.write(
      chunk({
        choices: [],
        usage: {
          prompt_tokens: tokens,
          completion_tokens: Math.ceil(reply.length / 4),
        },
      }),
    );
    res.end("data: [DONE]\n\n");
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

setCustomEndpointConfig({
  baseUrl: `http://127.0.0.1:${port}/v1`,
  model: "stock-model",
  contextWindow: WINDOW,
});
authStorage.set(OPENAI_COMPATIBLE, { type: "api_key", key: "houston-local" });
setSettings({ activeProvider: OPENAI_COMPATIBLE });

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const assistants = (id: string) =>
  getHistory(id)?.messages.filter((m) => m.role === "assistant") ?? [];
const piSessionFiles = (id: string) =>
  readdirSync(join(config.dataDir, "sessions", id)).filter((f) =>
    f.endsWith(".jsonl"),
  );

test("a pi routine run after a run bigger than the window starts fresh and fits", async () => {
  const id = "routine-stock-report";
  // One run exported ~36k tokens into the chat: it fit when it ran, but the
  // chat now holds most of the window, so the next run would carry it all.
  endpoint.replyChars = 144_000;
  await runTurn(id, PROMPT, undefined, { mode: "auto" });
  expect(assistants(id).at(-1)?.providerError).toBeUndefined();
  const before = piSessionFiles(id);

  endpoint.replyChars = 400;
  endpoint.requests.length = 0;
  await runTurn(id, PROMPT, undefined, { mode: "auto" });
  await runTurn(id, PROMPT, undefined, { mode: "auto" });

  // Every request of both later runs fit the window...
  expect(endpoint.requests.every((r) => !r.refused)).toBe(true);
  expect(assistants(id).map((m) => m.providerError?.kind)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  // ...because the first of them started a fresh pi session carrying a
  // bounded tail of the chat, and the second resumed that fresh session.
  const [reset, next] = assistants(id).slice(1);
  expect(reset?.compaction).toMatchObject({ trigger: "proactive" });
  expect(next?.compaction).toBeUndefined();
  const after = piSessionFiles(id);
  expect(after).toHaveLength(1);
  expect(after).not.toEqual(before);
  const resetRequest = endpoint.requests[0];
  expect(resetRequest?.body).toContain("This automation has run before");
  expect(resetRequest?.tokens).toBeLessThan(WINDOW / 2);
});
