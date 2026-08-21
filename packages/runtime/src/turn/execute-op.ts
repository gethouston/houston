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

/** Reserved claim key for agent-level writes (gateway + pod-store agree). */
export const AGENT_OPS_CLAIM_ID = "agent-ops";

/** Route ops skip the AGENT's runtime tree (`workspaces/<ws>/<agent>/
 *  .houston/runtime/`) — exactly that depth, so a user project carrying its
 *  own `.houston/runtime` directory is hydrated like any other file. */
const ROUTE_OP_EXCLUDES = ["workspaces/*/*/.houston/runtime/"];
/** A settings op reads/writes the runtime dir's small files only: skip the
 *  bulk (history, user files); the small .houston docs keep the layout real.
 *  A model-picker click must not pay a big agent's hydrate. */
const SETTINGS_OP_EXCLUDES = [
  "workspaces/*/*/.houston/runtime/conversations/",
  "workspaces/*/*/.houston/runtime/sessions/",
  "workspaces/*/*/files/",
  "workspaces/*/*/uploads/",
];
/** A credential op needs nothing but the agent directory to exist. */
const CREDENTIAL_OP_EXCLUDES = SETTINGS_OP_EXCLUDES;

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
      op.op.kind === "conversation" ? op.op.conversationId : AGENT_OPS_CLAIM_ID,
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
      // Agent-level routes (files, docs, skills) never read the runtime tree
      // (conversations, sessions) — the bulk of a busy agent. A settings op
      // needs the runtime dir minus those two. Conversation ops hydrate
      // everything. A credential op touches no file at all (the gateway's
      // store is the only write) — it still hydrates the layout so the
      // agent-exists check holds, with everything but the root excluded.
      ...(op.op.kind === "route"
        ? { excludes: ROUTE_OP_EXCLUDES }
        : op.op.kind === "settings"
          ? { excludes: SETTINGS_OP_EXCLUDES }
          : op.op.kind === "credential"
            ? { excludes: CREDENTIAL_OP_EXCLUDES }
            : {}),
    });
    const result = await applyOp(op, filesystem, deps.fetchImpl);
    if (result.agentMissing || result.decline) {
      // Not this worker's agent (legacy layout / stale envelope), or a case
      // the worker cannot serve: decline so the gateway takes its fallback,
      // never relay a spurious answer as the pod's.
      return json(res, 200, { ok: true, decline: true });
    }
    await heartbeat.checkpoint();
    if (heartbeat.fenced) return json(res, 409, { error: "claim_fenced" });
    const isRead = op.op.kind === "route" && op.op.method === "GET";
    if (!isRead) {
      const synced = await syncBack(
        resolved.store,
        resolved.prefix,
        filesystem.storeRoot,
        filesystem.manifest,
        { include: result.include, holdDeletesOnFailure: true },
      );
      const landed = synced.uploaded.length + synced.deleted.length > 0;
      const partial =
        synced.outOfScope > 0 ||
        synced.skipped.length > 0 ||
        synced.conflicts.length > 0;
      if (partial) {
        console.error(
          `[op] not durably synced: outOfScope=${synced.outOfScope} skipped=${synced.skipped.length} conflicts=${synced.conflicts.length} landed=${landed} prefix=${resolved.prefix} kind=${op.op.kind}`,
        );
        // NOTHING landed: declining is safe — the gateway proxies and the
        // pod applies the write from an unchanged tree.
        if (!landed) return json(res, 200, { ok: true, decline: true });
        // A file the store refuses (over its per-object cap) can never
        // persist anywhere — the pod would silently fail the same way.
        // Tell the user; the client does not retry a 413.
        if (synced.skipped.length > 0) {
          return json(res, 200, {
            ok: true,
            status: 413,
            contentType: "application/json",
            body: JSON.stringify({
              error: "file too large to store",
              files: synced.skipped.map((s) => s.key),
            }),
            events: [],
          });
        }
        // Something landed and something conflicted: the write is PARTLY
        // durable. Re-running it on the pod would duplicate the part that
        // landed (a routine create mints a fresh id); the client must be
        // told the result is unknown instead.
        return json(res, 200, { ok: true, ambiguous: true });
      }
      if (result.status < 300) {
        let failures = await republish(deps, turnLike, filesystem, result);
        if (failures.length > 0) {
          // One more round before accepting a lag: a blip on the doc PUT is
          // the common case and the files are already durable.
          await new Promise((resolve) => setTimeout(resolve, 500));
          failures = await republish(deps, turnLike, filesystem, result);
        }
        if (op.op.kind === "conversation") {
          failures.push(...(await opTranscriptMirror(deps, turnLike, op.op)));
        }
        if (failures.length > 0) {
          // The files ARE durable; only a doc/transcript projection lagged.
          // Never re-run (duplicates) — answer the handler's status and make
          // the gap loud: the next op's republish or the pod's wake-time
          // projector re-projects from the files.
          console.error(
            `[op] projection failed after a durable sync (asleep reads may lag until the next projection): ${failures.join("; ")} prefix=${resolved.prefix}`,
          );
        }
      }
    }
    json(res, 200, {
      ok: true,
      status: result.status,
      contentType: result.contentType,
      body: result.body,
      ...(result.bodyBase64 ? { bodyBase64: result.bodyBase64 } : {}),
      ...(result.headers ? { headers: result.headers } : {}),
      events: result.events.map((e) => e.type),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Loud: a 500 here is the gateway's "worker_500" with no other trace.
    console.error(
      `[op] failed kind=${op.op.kind} ${op.op.kind === "route" ? `${op.op.method} ${op.op.rest}` : ""}: ${message}`,
    );
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
