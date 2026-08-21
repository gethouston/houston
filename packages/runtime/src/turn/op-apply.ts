import { join, posix } from "node:path";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import { LazyReadRefusedError, PrefixedVfs } from "@houston/host/src/vfs";
import type { HoustonEvent } from "@houston/protocol";
import { applyServedCredential } from "../auth/auth-file";
import { generateTitle } from "../session/summarize";
import {
  deleteConversationAt,
  renameConversationMutationAt,
} from "../store/conversation-file";
import { applyApiKeyConnect } from "./op-credential";
import {
  claimActiveProviderIn,
  putSettingsIn,
  settingsOpFiles,
} from "./op-settings";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnModelRuntime } from "./turn-runtime";
import { poolIdentity } from "./turn-store";

export interface OpResult {
  status: number;
  contentType: string;
  body: string;
  /** Binary answer (file download / archive), base64 — relayed raw. */
  bodyBase64?: string;
  /** Response headers the client depends on (Content-Disposition, ...). */
  headers?: Record<string, string>;
  events: HoustonEvent[];
  /** Store-relative paths this op may have written (the sync-back scope). */
  include: (relativePath: string) => boolean;
  /** The pod's own /skills answer after a skills mutation (the skills view). */
  skillsView?: unknown;
  /** The hydrated tree had no such agent — decline, do not relay. */
  agentMissing?: boolean;
  /** The worker cannot serve this one (a provider that needs the pod). */
  decline?: boolean;
  /** A lazy read was refused mid-handler: the overlay may be partial. */
  tooLarge?: true;
}

const json = (
  status: number,
  value: unknown,
): Omit<OpResult, "include" | "events"> => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

/** Everything an agent-level route may touch: the agent's whole directory
 *  (family files, skills, markdown, any agentfile path the pod would
 *  accept) — never the runtime tree (conversations, sessions, auth), which
 *  stays conversation-scoped. Mirrors the pod-store's ops-claim scope. */
export function agentRouteScope(workspaceRel: string): OpResult["include"] {
  const root = `${workspaceRel}/`;
  const runtime = `${posix.join(workspaceRel, ".houston", "runtime")}/`;
  return (rel) => rel.startsWith(root) && !rel.startsWith(runtime);
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
      // The handlers address the agent under `workspaces/`; the turn's vfs
      // is rooted one level up (lazy or real, the same seam).
      const vfs = new PrefixedVfs(filesystem.vfs, "workspaces");
      const result = await dispatchAgentOp({
        workspacesRoot: join(filesystem.storeRoot, "workspaces"),
        agentId,
        vfs,
        request: {
          method: op.op.method,
          rest: op.op.rest,
          ...(op.op.query ? { query: op.op.query } : {}),
          ...(op.op.body !== undefined ? { body: op.op.body } : {}),
          ...(op.op.contentType ? { contentType: op.op.contentType } : {}),
          ...(op.actingAs
            ? {
                actingSub: op.actingAs.userId,
                // Gateway-fronted: the acting human is a full contributor on
                // missions, exactly as the pod stamps it from the acting header.
                actingAuthor: {
                  user_id: op.actingAs.userId,
                  ...(op.actingAs.name ? { name: op.actingAs.name } : {}),
                },
              }
            : {}),
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
          vfs,
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
    case "settings": {
      const none = () => false;
      try {
        const settings =
          op.op.action === "put"
            ? putSettingsIn(filesystem.dataDir, op.op.input)
            : claimActiveProviderIn(
                filesystem.dataDir,
                op.op.provider,
                op.op.connectedProviders,
              );
        const files = new Set(settingsOpFiles(filesystem.dataRel));
        return {
          ...json(200, settings),
          events: [],
          include: (rel) => files.has(rel),
        };
      } catch (e) {
        return {
          ...json(400, { error: e instanceof Error ? e.message : String(e) }),
          events: [],
          include: none,
        };
      }
    }
    case "credential": {
      const none = () => false;
      const { org, agent } = poolIdentity(op.gcsPrefix);
      const answer = await applyApiKeyConnect({
        provider: op.op.provider,
        apiKey: op.op.apiKey,
        credentialsBaseUrl: new URL(op.claim.heartbeatUrl).origin,
        orgSlug: org,
        agentSlug: agent,
        hostToken: op.hostToken,
        ...(op.actingToken ? { actingAs: op.actingToken } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      });
      if ("decline" in answer) {
        return {
          ...json(503, { error: "provider needs the pod" }),
          events: [],
          include: none,
          decline: true,
        };
      }
      return { ...json(answer.status, answer.body), events: [], include: none };
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
      const notFound = {
        ...json(404, { error: "conversation not found" }),
        events: [],
        include,
      };
      const conversationsRel = posix.join(filesystem.dataRel, "conversations");
      const fileRel = posix.join(
        conversationsRel,
        `${encodeURIComponent(conversationId)}.json`,
      );
      // Existence from the listing: a lazy tree answers it without a
      // download (the pod's 404 for an unknown conversation, same contract).
      const exists = (await filesystem.vfs.list(conversationsRel)).includes(
        fileRel,
      );
      if (!exists) return notFound;
      if (action === "delete") {
        // Deletes need no bytes: tombstone the file and the session dir so
        // a lazy tree never downloads what it is about to remove.
        await filesystem.vfs.deleteKey(fileRel);
        await filesystem.vfs.deletePrefix(
          posix.join(filesystem.dataRel, "sessions", conversationId),
        );
        deleteConversationAt(dir, conversationId);
      } else {
        // A rename reads the file: materialize it (a hydrated tree already
        // has it). Over the read cap the pod must do it — decline.
        try {
          await filesystem.vfs.readBytes(fileRel);
        } catch (error) {
          if (!(error instanceof LazyReadRefusedError)) throw error;
          return {
            ...json(503, { error: "conversation too large to edit asleep" }),
            events: [],
            include,
            decline: true,
          };
        }
        const renamed = renameConversationMutationAt(
          dir,
          conversationId,
          op.op.title ?? "",
        );
        if (renamed === null) return notFound;
      }
      return {
        ...json(200, { ok: true }),
        events: [{ type: "ConversationsChanged", agentPath: agentId }],
        include,
      };
    }
  }
}
