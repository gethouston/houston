import { createServer, type ServerResponse } from "node:http";

export interface EchoProviderOptions {
  firstByteDelayMs?: number;
  rejectedTokens?: readonly string[];
}

export interface SeenToken {
  token: string;
  path: string;
  at: number;
}

export interface EchoProvider {
  url: string;
  port: number;
  seenTokens: SeenToken[];
  close(): Promise<void>;
}

type ChatBody = {
  stream?: boolean;
  model?: string;
  messages?: Array<{ content?: unknown }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(req: AsyncIterable<unknown>): Promise<ChatBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as ChatBody;
}

function lastText(body: ChatBody): string {
  const content = body.messages?.at(-1)?.content;
  if (typeof content === "string") return content;
  return "turn";
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function startEchoProvider(
  opts: EchoProviderOptions = {},
): Promise<EchoProvider> {
  const seenTokens: SeenToken[] = [];
  const rejected = new Set(opts.rejectedTokens ?? []);
  const firstByteDelayMs =
    opts.firstByteDelayMs ??
    Number(process.env.HOUSTON_ECHO_FIRST_BYTE_DELAY_MS || 40);
  const server = createServer((req, res) => {
    void (async () => {
      const path = (req.url || "/").split("?")[0];
      if (req.method !== "POST" || path !== "/v1/chat/completions") {
        return json(res, 404, { error: { message: "not found" } });
      }
      const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
      const token = match?.[1] ?? "";
      seenTokens.push({ token, path, at: Date.now() });
      if (!token || rejected.has(token)) {
        return json(res, 401, { error: { message: "invalid API key" } });
      }
      const body = await readBody(req);
      const content = `echo:${lastText(body)}`;
      await sleep(firstByteDelayMs);
      if (!body.stream) {
        return json(res, 200, {
          id: "chatcmpl-echo",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model ?? "echo",
          choices: [{ index: 0, message: { role: "assistant", content } }],
        });
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const part of [
        content.slice(0, 5),
        content.slice(5, 12),
        content.slice(12),
      ]) {
        if (!part) continue;
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`,
        );
      }
      res.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) json(res, 400, { error: { message } });
      else res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("echo provider did not bind a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    port: address.port,
    seenTokens,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
