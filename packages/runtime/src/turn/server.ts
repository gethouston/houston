import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { MAX_UPLOAD_BODY_BYTES } from "@houston/host/src/turn/files-import";
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

/**
 * Bind a dispatched turn to THIS pod incarnation. The X-Internal-Token is stable
 * per ordinal, so a replacement pod reusing this ordinal+IP would otherwise
 * accept a turn the gateway minted for the PRIOR incarnation. The gateway sends
 * the trusted k8s UID (from the pod_workers stamp) as X-Pool-Pod-UID; a pod
 * refuses any UID that is not its own downward-API UID. This can only reject,
 * never admit, so a tenant that reads its own UID gains nothing. A single-use
 * pod fails closed — a missing header is refused, since the Critical-2 dispatcher
 * always sends it and the deploy gate guarantees it precedes single-use pods.
 * `podUid` empty (off-cluster / per-agent worker) disables the check.
 */
function incarnationOK(
  req: IncomingMessage,
  podUid: string | undefined,
  singleUse: boolean,
): boolean {
  if (!podUid) return true;
  const header = req.headers["x-pool-pod-uid"];
  if (typeof header !== "string" || header.length === 0) return !singleUse;
  const got = Buffer.from(header);
  const want = Buffer.from(podUid);
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
const OP_BODY_MAX_BYTES = MAX_UPLOAD_BODY_BYTES + 1024 * 1024;

export function createTurnServer(deps: TurnServerDeps): Server {
  const admission =
    deps.admission ??
    new AdmissionLimiter(deps.concurrency ?? turnConcurrency());
  return createServer((req, res) => {
    (async () => {
      const path = (req.url || "/").split("?")[0];
      if (req.method === "GET" && path === "/health") {
        // A draining/spent worker reports NOT-ready (503) so a readiness probe
        // marks a spent single-use pod 0/1 READY instead of Running — the
        // operator signal that a pod exited its one turn and is awaiting
        // recycle, and a belt to keep the gateway from dispatching to it.
        if (deps.isDraining?.()) {
          return json(res, 503, { status: "draining", mode: "turn" });
        }
        return json(res, 200, { status: "ok", mode: "turn" });
      }
      if (req.method !== "POST" || (path !== "/turn" && path !== "/op")) {
        return json(res, 404, { error: "not found" });
      }
      if (!authorized(req, deps.token)) {
        return json(res, 401, { error: "unauthorized" });
      }
      if (!incarnationOK(req, deps.podUid, Boolean(deps.singleUse))) {
        return json(res, 409, { error: "pod_uid_mismatch" });
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
        // turn, a fraction of the work. The cap is the Files import cap plus
        // envelope headroom: an upload rides the op exactly as it rides the
        // pod (base64 JSON), and the pod reads it with the same limit.
        // Admission BEFORE the body is drained: the cap is ~135 MiB, so N
        // parked uploads must not buffer N bodies on a worker that runs one
        // op at a time. A refused request never reads its body.
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
          const body = await readJson(req, OP_BODY_MAX_BYTES);
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
      // A single-use worker enables local bash for its ONE claimed turn; an
      // unclaimed non-shadow turn would run bash (turnCodeExecutionMode keys on
      // config) without ever spending the pod — serially reusable cross-tenant
      // bash, the exact thing single-use exists to forbid. Only a claim carries
      // a tenant boundary here, so reject unclaimed real turns outright. Shadow
      // (model warm-up) runs no pi and is fine.
      if (deps.singleUse && !turn.shadow && !turn.claim) {
        return json(res, 400, { error: "single_use_requires_claim" });
      }
      const release = admission.tryAcquire();
      if (!release) {
        return json(res, 503, { error: "worker_full" }, { "Retry-After": "1" });
      }
      // A claimed real turn spends the worker; a shadow warm-up runs no pi and
      // must NOT (it would kill the pod at warm time). Concurrency is 1 on a
      // single-use worker, so the slot is held for the whole turn — a second
      // request cannot acquire until this one releases, by which point `begin`
      // has latched the pod spent and `isDraining` is true.
      const spend = Boolean(turn.claim && !turn.shadow && deps.singleUse);
      try {
        // Re-check AFTER acquiring the slot: a request parked in readJson can
        // pass the pre-body draining gate, then reach here once the pod's one
        // turn has already spent it. isDraining() is true the instant begin()
        // latches, so this closes the straddle.
        if (deps.isDraining?.()) {
          return json(
            res,
            503,
            { error: "worker_draining" },
            { "Retry-After": "1" },
          );
        }
        // Latch BEFORE the turn runs: a crash mid-turn must still leave the
        // restarted container refusing to serve (single-use.ts).
        if (spend) await deps.singleUse?.begin();
        await executeTurn(deps, turn, req, res, {
          t0_request: performance.now(),
        });
      } finally {
        release();
        if (spend) deps.singleUse?.settled();
      }
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[turn] unhandled:", message);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
