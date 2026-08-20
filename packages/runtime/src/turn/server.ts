import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { AdmissionLimiter, turnConcurrency } from "./admission";
import { executeOp } from "./execute-op";
import { executeTurn } from "./execute-turn";
import { parseTurnRequest } from "./parse-turn-request";
import type { TurnServerDeps } from "./server-types";
import type { TurnRequest } from "./types";

export type { TurnServerDeps } from "./server-types";

/**
 * The pooled per-turn runtime. Each admitted request hydrates one agent into a
 * throwaway root, runs at most one turn, syncs durable changes, then wipes the
 * root. Admission is explicit because one process may receive several HTTP
 * requests even when v1 capacity is one.
 *
 * Authorization remains two-layered: deployment IAM protects the endpoint,
 * while X-Internal-Token is the application secret for ordinary turn traffic.
 */

function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers["x-internal-token"];
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJson(
  req: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength;
    if (size > maxBytes) {
      throw new Error(`request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

/** Create the bounded HTTP server used by stateless per-turn workers. */
export function createTurnServer(deps: TurnServerDeps): Server {
  const admission =
    deps.admission ??
    new AdmissionLimiter(deps.concurrency ?? turnConcurrency());
  return createServer((req, res) => {
    (async () => {
      const path = (req.url || "/").split("?")[0];
      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { status: "ok", mode: "turn" });
      }
      if (req.method !== "POST" || (path !== "/turn" && path !== "/op")) {
        return json(res, 404, { error: "not found" });
      }
      if (!authorized(req, deps.token)) {
        return json(res, 401, { error: "unauthorized" });
      }
      if (deps.isDraining?.()) {
        return json(
          res,
          503,
          { error: "worker_draining" },
          { "Retry-After": "1" },
        );
      }
      if (path === "/op") {
        // A write for a sleeping agent (docs/op): same auth + admission as a
        // turn, a fraction of the work.
        const body = await readJson(req, 1024 * 1024);
        const releaseOp = admission.tryAcquire();
        if (!releaseOp) {
          return json(
            res,
            503,
            { error: "worker_full" },
            { "Retry-After": "1" },
          );
        }
        try {
          await executeOp(deps, req, res, body);
        } finally {
          releaseOp();
        }
        return;
      }
      let turn: TurnRequest;
      try {
        turn = parseTurnRequest(await readJson(req, 1024 * 1024));
      } catch (error) {
        return json(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      const release = admission.tryAcquire();
      if (!release) {
        return json(res, 503, { error: "worker_full" }, { "Retry-After": "1" });
      }
      try {
        await executeTurn(deps, turn, req, res, {
          t0_request: performance.now(),
        });
      } finally {
        release();
      }
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[turn] unhandled:", message);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
