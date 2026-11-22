import { join } from "node:path";
import { applyServedCredential } from "../auth/auth-file";
import { generateTitle } from "../session/summarize";
import { applyConversationOp } from "./op-conversation";
import { applyApiKeyConnect, credentialOpFiles } from "./op-credential";
import { applyCustomOAuthOp } from "./op-custom-oauth";
import { applyEndpointConnect } from "./op-endpoint";
import { prepareFirstDayOp } from "./op-first-day";
import { assertWorkerOpProvider } from "./op-provider-guard";
import { applyRouteOp } from "./op-route";
import {
  claimActiveProviderIn,
  putSettingsIn,
  settingsOpFiles,
} from "./op-settings";
import type { OpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";
import { claudeTitleRunner } from "./turn-mission-title";
import { createTurnModelRuntime } from "./turn-runtime";
import { poolIdentity } from "./turn-store";

export type { OpResult } from "./op-result";

import type { OpResult } from "./op-result";

const json = (
  status: number,
  value: unknown,
): Omit<OpResult, "include" | "events"> => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

/** A JSON answer whose sync-back scope is an exact file list (or nothing). */
const answered = (
  answer: { status: number; body: unknown },
  files: string[] = [],
): OpResult => {
  const set = new Set(files);
  return {
    ...json(answer.status, answer.body),
    events: [],
    include: (rel) => set.has(rel),
  };
};

export async function applyOp(
  op: OpRequest,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<OpResult> {
  const none = () => false;
  switch (op.op.kind) {
    case "custom-oauth":
      return applyCustomOAuthOp({ ...op, op: op.op }, filesystem, fetchImpl);
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
        return answered(answer, settingsOpFiles(filesystem.dataRel));
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
        return answered(
          { status: 200, body: settings },
          settingsOpFiles(filesystem.dataRel),
        );
      } catch (e) {
        return answered({
          status: 400,
          body: { error: e instanceof Error ? e.message : String(e) },
        });
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
      // Success-only: a 502 store push must not durably repoint the agent at
      // an endpoint whose key never landed.
      return answered(
        answer,
        answer.status === 200 ? credentialOpFiles(filesystem.dataRel) : [],
      );
    }
    case "title": {
      if (!op.credential) {
        return {
          ...json(503, { error: "no credential for title" }),
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
      const excerpt = op.op.text.trim().slice(0, 2400);
      if (op.credential.provider === "anthropic") {
        const title = await claudeTitleRunner({
          model,
          directories: filesystem,
        })(excerpt);
        return { ...json(200, { title }), events: [], include: none };
      }
      assertWorkerOpProvider(model.provider);
      const title = await generateTitle({
        cwd: workspaceDir,
        model,
        modelRuntime,
        excerpt,
      });
      return { ...json(200, { title }), events: [], include: none };
    }
    case "conversation":
      return applyConversationOp(op.op, filesystem, op.actingAs?.userId);
    case "first-day":
      return prepareFirstDayOp(op, filesystem);
    case "seed":
    case "migrate":
      // Both run their own hydrate and sync (op-seed.ts, op-migrate.ts);
      // executeOp never hands them this filesystem.
      throw new Error(`a ${op.op.kind} op does not run over this tree`);
    case "reconcile":
      throw new Error("a reconcile op runs its own path (op-reconcile.ts)");
  }
}
