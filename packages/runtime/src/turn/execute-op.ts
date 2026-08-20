import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  docKey,
  type HoustonFamily,
  normalizeActivities,
  normalizeLearnings,
  normalizeRoutineRuns,
  normalizeRoutines,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import { syncBack } from "@houston/runtime-client/object-sync";
import { startClaimHeartbeat } from "./claim-heartbeat";
import { applyOp, type OpResult } from "./op-apply";
import { opTranscriptMirror } from "./op-transcript";
import { parseOpRequest } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import { publish } from "./turn-activity-doc";
import { prepareTurnFilesystem, type TurnFilesystem } from "./turn-filesystem";
import { poolIdentity, resolveTurnStore } from "./turn-store";

const EVENT_FAMILY: Partial<Record<HoustonEvent["type"], HoustonFamily>> = {
  ActivityChanged: "activity",
  RoutinesChanged: "routines",
  RoutineRunsChanged: "routine_runs",
  ConfigChanged: "config",
  LearningsChanged: "learnings",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * POST /op — a write for a sleeping agent, executed here instead of on its
 * pod: claim → hydrate → the real handler → scoped sync-back → doc republish.
 * Answers the handler's own status and body inside `{ok, status, body}` so
 * the gateway relays exactly what the pod would have said.
 */
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
  const turnLike = {
    ...op,
    conversationId:
      op.op.kind === "conversation" ? op.op.conversationId : "__agent_ops__",
  };
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
    const filesystem = await prepareTurnFilesystem({
      store: resolved.store,
      prefix: resolved.prefix,
      root,
      claimed: true,
      ...(deps.maxHydrateBytes !== undefined
        ? { maxBytes: deps.maxHydrateBytes }
        : {}),
    });
    const result = await applyOp(op, filesystem, deps.fetchImpl);
    await heartbeat.checkpoint();
    if (heartbeat.fenced) return json(res, 409, { error: "claim_fenced" });
    const synced = await syncBack(
      resolved.store,
      resolved.prefix,
      filesystem.storeRoot,
      filesystem.manifest,
      {
        include: result.include,
      },
    );
    if (synced.outOfScope > 0) {
      console.info(
        `[op] pool_writes_out_of_scope=${synced.outOfScope} prefix=${resolved.prefix} kind=${op.op.kind}`,
      );
    }
    const diagnostics: string[] = [];
    if (result.status < 300) {
      diagnostics.push(
        ...(await republish(deps, turnLike, filesystem, result)),
      );
      if (op.op.kind === "conversation") {
        diagnostics.push(...(await opTranscriptMirror(deps, turnLike, op.op)));
      }
    }
    json(res, 200, {
      ok: true,
      status: result.status,
      contentType: result.contentType,
      body: result.body,
      events: result.events.map((e) => e.type),
      ...(diagnostics.length ? { diagnostics } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) json(res, 500, { error: message });
  } finally {
    try {
      await heartbeat.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

/** Re-project every family the op changed, plus the skills view. */
async function republish(
  deps: TurnServerDeps,
  turn: {
    gcsPrefix: string;
    hostToken: string;
    claim: { token: string; bootId: string };
    conversationId: string;
  },
  filesystem: TurnFilesystem,
  result: OpResult,
): Promise<string[]> {
  const diagnostics: string[] = [];
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl) return diagnostics;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const common = {
    baseUrl,
    org,
    agent,
    conversationId: turn.conversationId,
    hostToken: turn.hostToken,
    claim: turn.claim,
    fetchImpl: deps.fetchImpl ?? fetch,
  };
  const families = new Set<HoustonFamily>();
  let skills = false;
  for (const event of result.events) {
    const family = EVENT_FAMILY[event.type];
    if (family) families.add(family);
    if (event.type === "SkillsChanged") skills = true;
  }
  for (const family of families) {
    const key = docKey(filesystem.workspaceRel, family);
    let doc: unknown;
    try {
      const raw = await readFile(join(filesystem.storeRoot, key), "utf8");
      doc = normalizeFamily(
        family,
        JSON.parse(raw.replace(/^\uFEFF/, "")),
        key,
      );
    } catch {
      doc = family === "config" ? {} : [];
    }
    const outcome = await publish({ ...common, family }, doc);
    if ("error" in outcome) diagnostics.push(`${family}: ${outcome.error}`);
  }
  if (skills && result.skillsView !== undefined) {
    const outcome = await publish(
      { ...common, family: "skills" },
      result.skillsView,
    );
    if ("error" in outcome) diagnostics.push(`skills: ${outcome.error}`);
  }
  return diagnostics;
}

function normalizeFamily(
  family: HoustonFamily,
  parsed: unknown,
  key: string,
): unknown {
  switch (family) {
    case "activity":
      return normalizeActivities(parsed, key).items;
    case "routines":
      return normalizeRoutines(parsed, key).items;
    case "routine_runs":
      return normalizeRoutineRuns(parsed, key).items;
    case "learnings":
      return normalizeLearnings(parsed, key).items;
    case "config":
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? parsed
        : {};
    default:
      return parsed;
  }
}
