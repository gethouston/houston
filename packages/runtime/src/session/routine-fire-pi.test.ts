import { mkdtempSync, readdirSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routineRunPreamble } from "@houston/domain";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

/**
 * The pi half of the routine context rule, through the standing server's real
 * turn path and the REAL pi session store: every fire opens a new pi session
 * carrying the digest, and a person's turn resumes the last one. Only the
 * provider is simulated, an OpenAI-compatible endpoint that records every
 * request (4 characters ≈ 1 token).
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
/** A routine fire, as the host's firer sends it (ROUTINE_FIRE_HEADER). */
const fireRoutine = (id: string) =>
  runTurn(
    id,
    PROMPT,
    undefined,
    { mode: "auto" },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { routineFire: true },
  );
const piSessionFiles = (id: string) =>
  readdirSync(join(config.dataDir, "sessions", id)).filter((f) =>
    f.endsWith(".jsonl"),
  );

test("every pi fire opens a new session on the digest; a person's turn resumes it", async () => {
  const id = "routine-stock-report";
  // One run exported ~36k tokens into the chat, which a resumed session
  // would re-send on every later call.
  endpoint.replyChars = 144_000;
  await fireRoutine(id);
  const first = piSessionFiles(id);

  endpoint.replyChars = 400;
  endpoint.requests.length = 0;
  await fireRoutine(id);
  const second = piSessionFiles(id);
  await fireRoutine(id);
  const third = piSessionFiles(id);
  await runTurn(id, "Which SKUs were low yesterday?", undefined, {
    mode: "auto",
  });

  expect(assistants(id).map((m) => m.providerError?.kind)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  // One live session at a time, a new one per fire.
  expect([first, second, third].map((files) => files.length)).toEqual([
    1, 1, 1,
  ]);
  expect(new Set([...first, ...second, ...third]).size).toBe(3);
  expect(piSessionFiles(id)).toEqual(third);
  const [fire2, fire3, chat] = endpoint.requests;
  for (const fire of [fire2, fire3]) {
    expect(fire?.body).toContain("[Earlier runs of this automation");
    expect(fire?.body).toContain("Export today's stock levels");
    // The 36k-token export never rides along again: only its excerpt does.
    expect(fire?.tokens).toBeLessThan(15_000);
  }
  // The person's turn carries the last fire's session, digest included.
  expect(chat?.body).toContain("Which SKUs were low yesterday?");
  expect(chat?.body).toContain("[Earlier runs of this automation");
  expect(endpoint.requests).toHaveLength(3);
});
