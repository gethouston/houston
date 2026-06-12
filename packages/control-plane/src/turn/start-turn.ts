import type { ServerResponse } from "node:http";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspaceCredential } from "../ports";
import { isExpiring } from "../credentials/refresh";
import { json, prefixFor, PROVIDER, type TurnDeps } from "./deps";
import { TurnQuotaError } from "./quota";
import { pumpSse } from "./sse";

/**
 * Fire one turn against the per-turn runtime: claim the workspace quota and
 * the per-agent relay slot, build the self-contained POST /turn (short-TTL
 * access credential included), and pump the runtime's SSE frames into the
 * relay where this conversation's subscribers receive them.
 */

/** The workspace's credential, refreshed centrally when expiring. Null = not connected. */
export async function freshCredential(
  deps: TurnDeps,
  wsId: string,
): Promise<WorkspaceCredential | null> {
  let cred = await deps.credentials.get(wsId, PROVIDER);
  if (!cred) return null;
  if (isExpiring(cred)) {
    cred = await deps.refresh(cred);
    await deps.credentials.put(cred);
  }
  return cred;
}

export async function startTurn(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  cid: string,
  text: string,
  nonce: string | undefined,
  res: ServerResponse,
): Promise<void> {
  let release: () => Promise<void>;
  try {
    release = await deps.quota.acquire(ws.id);
  } catch (err) {
    if (err instanceof TurnQuotaError) return json(res, 429, { error: err.message });
    throw err;
  }
  const prefix = prefixFor(ws, agent);
  const started = await deps.relay.start(agent.id, `${agent.id}/${cid}`, async (publish, signal) => {
    try {
      const cred = await freshCredential(deps, ws.id);
      const idToken = await deps.idToken();
      const upstream = await fetch(`${deps.runtimeUrl.replace(/\/$/, "")}/turn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(deps.turnToken ? { "x-internal-token": deps.turnToken } : {}),
          ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          workspaceId: ws.id,
          agentId: agent.id,
          conversationId: cid,
          text,
          nonce,
          gcsPrefix: prefix,
          credential: cred
            ? {
                provider: cred.provider,
                access: cred.accessToken,
                expires: cred.expiresAt,
                accountId: cred.accountId ?? null,
              }
            : null,
        }),
        signal,
      });
      if (!upstream.ok || !upstream.body) {
        throw new Error(
          `turn runtime ${upstream.status}: ${await upstream.text().catch(() => "")}`,
        );
      }
      await pumpSse(upstream.body, publish);
    } finally {
      await release();
    }
  });
  if (!started) {
    await release();
    return json(res, 409, { error: "a turn is already running for this agent" });
  }
  return json(res, 202, { ok: true });
}
