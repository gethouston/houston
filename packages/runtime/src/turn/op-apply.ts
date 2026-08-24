import { join, posix } from "node:path";
import { LazyReadRefusedError } from "@houston/host/src/vfs";
import type { HoustonEvent } from "@houston/protocol";
import { applyServedCredential } from "../auth/auth-file";
import { generateTitle } from "../session/summarize";
import {
  deleteConversationAt,
  renameConversationMutationAt,
} from "../store/conversation-file";
import { applyAnonymizeOp } from "./op-anonymize";
import { applyApiKeyConnect, credentialOpFiles } from "./op-credential";
import { applyEndpointConnect } from "./op-endpoint";
import { applyRouteOp } from "./op-route";
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
  /** The pod's own definitions answer after a custom-integration mutation. */
  customDefinitionsView?: unknown;
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
  const none = () => false;
  switch (op.op.kind) {
    case "route":
      return applyRouteOp(
        op as OpRequest & { op: Extract<OpRequest["op"], { kind: "route" }> },
        filesystem,
        fetchImpl,
      );
    case "settings": {
      if (op.op.action === "endpoint") {
        const { org, agent } = poolIdentity(op.gcsPrefix);
        const answer = await applyEndpointConnect(
          op as OpRequest & {
            op: Extract<
              OpRequest["op"],
              { kind: "settings"; action: "endpoint" }
            >;
          },
          {
            dataDir: filesystem.dataDir,
            credentialsBaseUrl: new URL(op.claim.heartbeatUrl).origin,
            orgSlug: org,
            agentSlug: agent,
            ...(fetchImpl ? { fetchImpl } : {}),
          },
        );
        const files = new Set(settingsOpFiles(filesystem.dataRel));
        return {
          ...json(answer.status, answer.body),
          events: [],
          include: (rel) => files.has(rel),
        };
      }
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
      const { org, agent } = poolIdentity(op.gcsPrefix);
      const answer = await applyApiKeyConnect({
        provider: op.op.provider,
        apiKey: op.op.apiKey,
        ...(op.op.endpoint ? { endpoint: op.op.endpoint } : {}),
        dataDir: filesystem.dataDir,
        credentialsBaseUrl: new URL(op.claim.heartbeatUrl).origin,
        orgSlug: org,
        agentSlug: agent,
        hostToken: op.hostToken,
        ...(op.actingToken ? { actingAs: op.actingToken } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      });
      // The connect may write the qwen region / azure endpoint file beside
      // the key (the store is the key's only home — auth.json never syncs).
      const files = new Set(credentialOpFiles(filesystem.dataRel));
      return {
        ...json(answer.status, answer.body),
        events: [],
        include: (rel) => files.has(rel),
      };
    }
    case "anonymize": {
      const answer = await applyAnonymizeOp(
        op as OpRequest & {
          op: Extract<OpRequest["op"], { kind: "anonymize" }>;
        },
        agentId,
        filesystem,
      );
      if ("agentMissing" in answer) {
        return {
          ...json(404, { error: "agent not found" }),
          events: [],
          include: none,
          agentMissing: true,
        };
      }
      return { ...json(answer.status, answer.body), events: [], include: none };
    }
    case "title": {
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
