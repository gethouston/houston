import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startClaimHeartbeat } from "./claim-heartbeat";
import { applyOp } from "./op-apply";
import { answerOpFailure } from "./op-failure";
import { executeOwnTreeOp } from "./op-own-tree";
import { executeReconcileOp } from "./op-reconcile";
import { syncOp } from "./op-sync";
import { opClaimId, opTreeOptions } from "./op-tree-options";
import { parseOpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { resolveTurnStore } from "./turn-store";

export { AGENT_IMPORT_CLAIM_ID, AGENT_OPS_CLAIM_ID } from "./op-tree-options";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function executeOp(
  deps: TurnServerDeps,
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  let op: ReturnType<typeof parseOpRequest>;
  try {
    op = parseOpRequest(body);
  } catch (error) {
    return json(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const root = await mkdtemp(join(tmpdir(), "houston-op-"));
  const abort = new AbortController();
  const turnLike = { ...op, conversationId: opClaimId(op.op) };
  const heartbeat = startClaimHeartbeat({
    claim: op.claim,
    hostToken: op.hostToken,
    onFenced: () => abort.abort(),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.heartbeatIntervalMs
      ? { intervalMs: deps.heartbeatIntervalMs }
      : {}),
  });
  try {
    const resolved = resolveTurnStore(turnLike, deps.store, {
      poolStoreUrl: deps.poolStoreUrl,
      fetchImpl: deps.fetchImpl,
    });
    const own = executeOwnTreeOp({
      deps,
      op,
      turn: turnLike,
      store: resolved.store,
      prefix: resolved.prefix,
      root,
      fenced: async () => {
        await heartbeat.checkpoint();
        return heartbeat.fenced;
      },
    });
    if (own) {
      const reply = await own;
      return json(res, reply.status, reply.body);
    }
    const filesystem = await prepareTurnFilesystem({
      store: resolved.store,
      prefix: resolved.prefix,
      root,
      claimed: true,
      ...(deps.maxHydrateBytes !== undefined
        ? { maxBytes: deps.maxHydrateBytes }
        : {}),
      ...opTreeOptions(op.op),
    });
    if (op.op.kind === "reconcile") {
      const reply = await executeReconcileOp({
        deps,
        op: { ...op, op: op.op },
        turn: turnLike,
        resolved,
        filesystem,
        heartbeat,
      });
      return json(res, reply.status, reply.body);
    }
    const result = await (deps.runOp ?? applyOp)(
      op,
      filesystem,
      deps.fetchImpl,
    );
    if (result.agentMissing || result.decline) {
      return json(res, 200, { ok: true, decline: true });
    }
    await heartbeat.checkpoint();
    if (heartbeat.fenced) return json(res, 409, { error: "claim_fenced" });
    if (result.ambiguous) return json(res, 200, { ok: true, ambiguous: true });
    const { announce, reply } = await syncOp({
      deps,
      op,
      filesystem,
      result,
      resolved,
      turnLike,
    });
    if (reply) return json(res, 200, reply);
    json(res, 200, {
      ok: true,
      status: result.status,
      contentType: result.contentType,
      body: result.body,
      ...(result.bodyBase64 ? { bodyBase64: result.bodyBase64 } : {}),
      ...(result.headers ? { headers: result.headers } : {}),
      events: announce,
    });
  } catch (error) {
    answerOpFailure(res, op, error);
  } finally {
    try {
      await heartbeat.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}
