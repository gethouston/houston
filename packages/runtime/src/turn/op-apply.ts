import { rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import type { HoustonEvent } from "@houston/protocol";
import { applyServedCredential } from "../auth/auth-file";
import { generateTitle } from "../session/summarize";
import {
  deleteConversationAt,
  renameConversationMutationAt,
} from "../store/conversation-file";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnModelRuntime } from "./turn-runtime";

export interface OpResult {
  status: number;
  contentType: string;
  body: string;
  events: HoustonEvent[];
  /** Store-relative paths this op may have written (the sync-back scope). */
  include: (relativePath: string) => boolean;
  /** The pod's own /skills answer after a skills mutation (the skills view). */
  skillsView?: unknown;
}

const json = (
  status: number,
  value: unknown,
): Omit<OpResult, "include" | "events"> => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

/** Everything an agent-level route may touch: the `.houston` tree, skills,
 *  and the agent's markdown — never conversations or user files. */
export function agentRouteScope(workspaceRel: string): OpResult["include"] {
  const prefixes = [
    `${posix.join(workspaceRel, ".houston")}/`,
    `${posix.join(workspaceRel, ".agents")}/`,
  ];
  const files = new Set([
    posix.join(workspaceRel, "CLAUDE.md"),
    posix.join(workspaceRel, "GROUP.md"),
  ]);
  return (rel) => files.has(rel) || prefixes.some((p) => rel.startsWith(p));
}

/** One conversation's file + sessions. */
export function conversationScope(
  dataRel: string,
  cid: string,
): OpResult["include"] {
  const file = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(cid)}.json`,
  );
  const sessions = `${posix.join(dataRel, "sessions", cid)}/`;
  return (rel) => rel === file || rel.startsWith(sessions);
}

/**
 * The engine's agent id ("Workspace/Agent") from the hydrated layout. The
 * gateway's envelope names the agent by SLUG; turns never need the engine
 * id (the layout resolver finds the single agent), but the host handlers
 * address the agent by its id — so it is derived here, never trusted.
 */
export function engineAgentId(filesystem: TurnFilesystem): string {
  return filesystem.workspaceRel.replace(/^workspaces\//, "");
}

export async function applyOp(
  op: OpRequest,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<OpResult> {
  const agentId = engineAgentId(filesystem);
  switch (op.op.kind) {
    case "route": {
      const result = await dispatchAgentOp({
        workspacesRoot: join(filesystem.storeRoot, "workspaces"),
        agentId,
        request: {
          method: op.op.method,
          rest: op.op.rest,
          ...(op.op.body !== undefined ? { body: op.op.body } : {}),
          ...(op.op.contentType ? { contentType: op.op.contentType } : {}),
          ...(op.actingAs ? { actingSub: op.actingAs.userId } : {}),
          triggersEnabled: op.triggersEnabled,
        },
        ...(fetchImpl ? { fetchImpl } : {}),
      });
      const out: OpResult = {
        ...result,
        include: agentRouteScope(filesystem.workspaceRel),
      };
      if (result.events.some((e) => e.type === "SkillsChanged")) {
        // Re-capture the skills view the way the pod would serve it, so the
        // gateway's asleep reads show the install/remove immediately.
        const view = await dispatchAgentOp({
          workspacesRoot: join(filesystem.storeRoot, "workspaces"),
          agentId,
          request: {
            method: "GET",
            rest: "skills",
            triggersEnabled: op.triggersEnabled,
          },
          ...(fetchImpl ? { fetchImpl } : {}),
        });
        if (view.status === 200) {
          try {
            out.skillsView = JSON.parse(view.body);
          } catch {
            /* not JSON: leave the previous view */
          }
        }
      }
      return out;
    }
    case "title": {
      const none = () => false;
      if (!op.credential) {
        return {
          ...json(503, { error: "no credential for title" }),
          events: [],
          include: none,
        };
      }
      if (op.credential.provider === "anthropic") {
        // COMPLIANCE GATE: anthropic titles must go through the Claude SDK
        // (never pi in-process); that path is pod-only, so a cold anthropic
        // agent keeps the client's truncated-title fallback.
        return {
          ...json(503, { error: "anthropic titles run on the pod" }),
          events: [],
          include: none,
        };
      }
      const { dataDir, workspaceDir } = filesystem;
      applyServedCredential(join(dataDir, "auth.json"), op.credential);
      const { modelRuntime, model } = await createTurnModelRuntime(
        dataDir,
        op.credential.provider,
      );
      const title = await generateTitle({
        cwd: workspaceDir,
        model,
        modelRuntime,
        excerpt: op.op.text.trim().slice(0, 2400),
      });
      return { ...json(200, { title }), events: [], include: none };
    }
    case "conversation": {
      const { conversationId, action } = op.op;
      const dir = join(filesystem.dataDir, "conversations");
      const include = conversationScope(filesystem.dataRel, conversationId);
      // The runtime's own directory-scoped mutations — the pod's PATCH/DELETE
      // call the same functions against its live data dir.
      const found =
        action === "rename"
          ? renameConversationMutationAt(
              dir,
              conversationId,
              op.op.title ?? "",
            ) !== null
          : deleteConversationAt(dir, conversationId);
      if (!found) {
        return {
          ...json(404, { error: "conversation not found" }),
          events: [],
          include,
        };
      }
      if (action === "delete") {
        await rm(join(filesystem.dataDir, "sessions", conversationId), {
          recursive: true,
          force: true,
        });
      }
      return {
        ...json(200, { ok: true }),
        events: [{ type: "ConversationsChanged", agentPath: agentId }],
        include,
      };
    }
  }
}
