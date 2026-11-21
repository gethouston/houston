import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_UPLOAD_BODY_BYTES } from "@houston/host/src/turn/files-import";
import type { AdmissionLimiter } from "./admission";
import { executeOp } from "./execute-op";
import { executeTurn } from "./execute-turn";
import { parseTurnRequest } from "./parse-turn-request";
import { json, readJson, wireErrorMessage } from "./server-http";
import type { TurnServerDeps } from "./server-types";
import type { TurnRequest } from "./types";

const OP_BODY_MAX_BYTES = MAX_UPLOAD_BODY_BYTES + 1024 * 1024;

export async function serveOp(
  deps: TurnServerDeps,
  admission: AdmissionLimiter,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const releaseOp = admission.tryAcquire();
  if (!releaseOp) {
    return json(res, 503, { error: "worker_full" }, { "Retry-After": "1" });
  }
  try {
    const body = await readJson(req, OP_BODY_MAX_BYTES);
    await executeOp(deps, req, res, body);
  } finally {
    releaseOp();
  }
}

export async function serveTurn(
  deps: TurnServerDeps,
  admission: AdmissionLimiter,
  req: IncomingMessage,
  res: ServerResponse,
  arrival: Record<string, number>,
) {
  let turn: TurnRequest;
  try {
    turn = parseTurnRequest(await readJson(req, 40 * 1024 * 1024, arrival));
    arrival.t_body_parsed = performance.now();
  } catch (error) {
    return json(res, 400, {
      error: wireErrorMessage(error),
    });
  }
  if (deps.singleUse && !turn.shadow && !turn.claim) {
    return json(res, 400, { error: "single_use_requires_claim" });
  }
  const release = admission.tryAcquire();
  if (!release) {
    return json(res, 503, { error: "worker_full" }, { "Retry-After": "1" });
  }
  const spend = Boolean(turn.claim && !turn.shadow && deps.singleUse);
  try {
    if (deps.isDraining?.()) {
      return json(
        res,
        503,
        { error: "worker_draining" },
        { "Retry-After": "1" },
      );
    }
    if (spend) await deps.singleUse?.begin();
    await executeTurn(deps, turn, req, res, {
      ...arrival,
      t0_request: performance.now(),
    });
  } finally {
    release();
    if (spend) deps.singleUse?.settled();
  }
}
