import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { runInSandbox, DEFAULT_LIMITS, type RunRequest } from "./run";

function json(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(buf);
}

/** Read a JSON body, rejecting anything over the configured cap (early-abort). */
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

/**
 * Constant-time check of the app-layer token, which rides X-Sandbox-Token: the
 * Authorization header belongs to Cloud Run IAM (the service deploys with
 * --no-allow-unauthenticated, so Authorization carries the caller's
 * Google-signed ID token). Two independent gates need two headers — an app
 * token in Authorization would be consumed (and rejected) by IAM first.
 */
export function checkSandboxToken(
  header: string | string[] | undefined,
  want: string,
): boolean {
  if (typeof header !== "string") return false;
  // Constant-time compare so a wrong token can't be recovered byte-by-byte via
  // response timing. (The length difference is not itself secret.)
  const got = Buffer.from(header);
  const expected = Buffer.from(want);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function authorized(req: IncomingMessage): boolean {
  if (!config.token) return true; // open: local dev only
  return checkSandboxToken(req.headers["x-sandbox-token"], config.token);
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const method = req.method || "GET";
  const path = (req.url || "/").split("?")[0];

  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }

  if (method === "POST" && path === "/run") {
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
    let body: any;
    try {
      body = await readJson(req, config.maxBodyBytes);
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : "invalid body",
      });
    }
    try {
      const request: RunRequest = {
        language: body.language,
        code: body.code,
        files: body.files,
        timeoutMs: body.timeoutMs,
      };
      const result = await runInSandbox(request, DEFAULT_LIMITS);
      return json(res, 200, result);
    } catch (e) {
      // Validation failures (bad language, path escape, oversize) are the caller's
      // fault → 400 with the real reason. Never a silent default.
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
      // Surface the real reason (the caller is trusted infra: the control plane /
      // runtime, never the end user) so failures are debuggable, not swallowed.
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
      `  auth: ${config.token ? "bearer token required" : "open (local dev)"}`,
    );
  });
  return server;
}
