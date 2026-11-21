import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { config } from "./config";
import { DEFAULT_LIMITS, type RunRequest, runInSandbox } from "./run";

function json(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(buf);
}

async function readJson(
  req: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).byteLength;
    if (size > maxBytes)
      throw new Error(`request body exceeds ${maxBytes} bytes`);
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function checkSandboxToken(
  header: string | string[] | undefined,
  want: string,
): boolean {
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  const expected = Buffer.from(want);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function sandboxRequestAuthorized(
  header: string | string[] | undefined,
  gate: { token: string; allowUnauthenticated: boolean },
): boolean {
  if (!gate.token) return gate.allowUnauthenticated;
  return checkSandboxToken(header, gate.token);
}

function authorized(req: IncomingMessage): boolean {
  return sandboxRequestAuthorized(req.headers["x-sandbox-token"], config);
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const method = req.method || "GET";
  const path = (req.url || "/").split("?")[0];

  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }

  if (method === "POST" && path === "/run") {
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
    let body: unknown;
    try {
      body = await readJson(req, config.maxBodyBytes);
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : "invalid body",
      });
    }
    try {
      const b = body as Record<string, unknown>;
      const request: RunRequest = {
        language: b.language as RunRequest["language"],
        code: b.code as RunRequest["code"],
        files: b.files as RunRequest["files"],
        timeoutMs: b.timeoutMs as RunRequest["timeoutMs"],
      };
      const result = await runInSandbox(request, DEFAULT_LIMITS);
      return json(res, 200, result);
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json(res, 404, { error: "not found" });
}

export function startServer() {
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error("[sandbox] unhandled:", e);
      const details = e instanceof Error ? e.message : String(e);
      if (!res.headersSent)
        json(res, 500, { error: "internal error", details });
      else if (!res.writableEnded) res.end();
    });
  });
  server.listen(config.port, config.host, () => {
    console.log(
      `houston-code-sandbox listening on http://${config.host}:${config.port}`,
    );
    console.log(
      `  auth: ${
        config.token
          ? "X-Sandbox-Token required"
          : config.allowUnauthenticated
            ? "OPEN (SANDBOX_ALLOW_UNAUTHENTICATED=1, local dev)"
            : "REFUSING /run: no SANDBOX_TOKEN set"
      }`,
    );
  });
  return server;
}
