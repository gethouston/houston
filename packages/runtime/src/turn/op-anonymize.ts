import { join } from "node:path";
import { LocalPaths } from "@houston/host/src/paths";
import {
  type AnonymizeAiRunner,
  runPortableAnonymize,
} from "@houston/host/src/routes/portable-anonymize";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { PrefixedVfs } from "@houston/host/src/vfs";
import { applyServedCredential } from "../auth/auth-file";
import { anonymizeTextsWith } from "../session/anonymize";
import type { OpAnswer } from "./op-credential";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { createTurnModelRuntime } from "./turn-runtime";

/**
 * The export wizard's anonymize pass for a SLEEPING agent, on a pool worker
 * (the titles pattern): the pod's own gather + regex pre-pass over the
 * hydrated tree, the AI pass through a turn-local model runtime fed by the
 * envelope credential. Anthropic's pass is Claude-SDK-only (pod-only by
 * compliance) — the gateway swaps to another connected provider when one
 * exists; otherwise, and when no credential resolves at all, the regex-only
 * result ships WITH the reason, exactly the pod's own degraded mode. Never
 * a wake: every path here is a valid 200.
 */
export async function applyAnonymizeOp(
  op: OpRequest & { op: Extract<OpRequest["op"], { kind: "anonymize" }> },
  agentId: string,
  filesystem: TurnFilesystem,
): Promise<OpAnswer | { agentMissing: true }> {
  const store = new LocalWorkspaceStore(
    join(filesystem.storeRoot, "workspaces"),
  );
  const agent = await store.getAgent(agentId);
  const workspace = agent ? await store.getWorkspace(agent.workspaceId) : null;
  if (!agent || !workspace) return { agentMissing: true };
  const root = new LocalPaths().agentRoot(workspace, agent);
  const vfs = new PrefixedVfs(filesystem.vfs, "workspaces");

  // Anthropic's pass is Claude-SDK-only (pod-only by compliance); no
  // credential means the gateway could not resolve one. Both ship the
  // regex-only result with the reason — the wizard's existing degraded copy.
  const credential = op.credential;
  const usable = credential && credential.provider !== "anthropic";
  const ai: AnonymizeAiRunner | undefined = usable
    ? async (items) => {
        const { dataDir, workspaceDir } = filesystem;
        applyServedCredential(join(dataDir, "auth.json"), credential);
        const { modelRuntime, model } = await createTurnModelRuntime(
          dataDir,
          credential.provider,
        );
        return anonymizeTextsWith({ workspaceDir, model, modelRuntime }, items);
      }
    : undefined;

  const response = await runPortableAnonymize(
    {
      vfs,
      root,
      ...(ai ? { ai } : {}),
      aiUnavailableReason:
        "AI anonymization is not available right now; showing pattern-based redactions only",
    },
    op.op.input,
  );
  return { status: 200, body: response };
}
