import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { applyServedCredential } from "../auth/auth-file";
import { openSSE } from "../transport/sse";
import { hydrate, syncBack } from "./hydrate";
import type { ObjectStore } from "./object-store";
import { runPiTurn, type TurnOutcome } from "./turn-session";
import { parseTurnRequest, type TurnRequest } from "./types";

/**
 * The per-turn runtime server (cloud hosting layer). One request = one agent
 * turn: hydrate the agent's object-storage prefix into a throwaway dir, write
 * the per-turn access credential, run pi, stream wire frames back as SSE, sync
 * the delta to object storage, wipe the dir. The instance keeps NO tenant
 * state between requests; Cloud Run's per-instance microVM + concurrency=1 do
 * the co-residency isolation, exactly like the code sandbox.
 *
 * Auth is two-layer like the sandbox: Cloud Run IAM consumes Authorization
 * (only the control plane's SA holds run.invoker); X-Internal-Token carries
 * the app-layer secret. The terminal done/error frame is sent only AFTER
 * sync-back, so a client never sees `done` before its files are durable.
 */

export interface TurnServerDeps {
  store: ObjectStore;
  /** App-layer token; empty = open (local dev only). */
  token: string;
  /** Injectable for tests; defaults to the real pi turn. */
  runTurn?: typeof runPiTurn;
}

function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers["x-internal-token"];
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).byteLength;
    if (size > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`);
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function executeTurn(deps: TurnServerDeps, turn: TurnRequest, req: IncomingMessage, res: ServerResponse) {
  const root = await mkdtemp(join(tmpdir(), "houston-turn-"));
  const abort = new AbortController();
  req.on("close", () => abort.abort());
  try {
    const manifest = await hydrate(deps.store, turn.gcsPrefix, root);
    await mkdir(join(root, "workspace"), { recursive: true });
    await mkdir(join(root, "data"), { recursive: true });
    if (turn.credential) {
      applyServedCredential(join(root, "data", "auth.json"), turn.credential);
    }

    const sse = openSSE(res);
    const emit = (e: WireEvent) => sse.send(e.type, e.data);

    let outcome: TurnOutcome;
    if (!turn.credential) {
      emit({ type: "user", data: { content: turn.text, ts: Date.now(), nonce: turn.nonce } });
      outcome = { error: "No provider connected. Connect your subscription first." };
    } else {
      const run = deps.runTurn ?? runPiTurn;
      outcome = await run(
        root,
        turn.conversationId,
        turn.text,
        turn.credential.provider,
        emit,
        abort.signal,
        turn.nonce,
      );
    }

    // Durability BEFORE the terminal frame. A sync failure is data loss and
    // must surface as the turn's error — never a quiet `done`.
    try {
      await syncBack(deps.store, turn.gcsPrefix, root, manifest);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      outcome = { error: outcome.error ? `${outcome.error}; sync failed: ${m}` : `workspace sync failed: ${m}` };
    }

    if (outcome.error) sse.send("error", { message: outcome.error });
    else sse.send("done", null);
    sse.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function createTurnServer(deps: TurnServerDeps): Server {
  return createServer((req, res) => {
    (async () => {
      const path = (req.url || "/").split("?")[0];
      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { status: "ok", mode: "turn" });
      }
      if (req.method !== "POST" || path !== "/turn") {
        return json(res, 404, { error: "not found" });
      }
      if (!authorized(req, deps.token)) return json(res, 401, { error: "unauthorized" });
      let turn: TurnRequest;
      try {
        turn = parseTurnRequest(await readJson(req, 1024 * 1024));
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      await executeTurn(deps, turn, req, res);
    })().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[turn] unhandled:", message);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
