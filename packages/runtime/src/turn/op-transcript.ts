import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import type { AgentOp } from "./parse-op-request";
import type { TurnServerDeps } from "./server-types";
import { poolIdentity } from "./turn-store";

export async function opTranscriptMirror(
  deps: TurnServerDeps,
  turn: {
    gcsPrefix: string;
    hostToken: string;
    claim: { token: string; bootId: string };
    conversationId: string;
  },
  op: Extract<AgentOp, { kind: "conversation" }>,
): Promise<string[]> {
  if (op.action !== "rename" && op.action !== "delete") return [];
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl) return [];
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/pod/transcripts/${encodeURIComponent(org)}/${encodeURIComponent(agent)}/conversations/${encodeURIComponent(op.conversationId)}`;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchWithRetry(
    (input, init) =>
      fetchImpl(input, { ...init, signal: AbortSignal.timeout(5_000) }),
    url,
    {
      method: op.action === "rename" ? "PUT" : "DELETE",
      headers: {
        Authorization: `Bearer ${turn.hostToken}`,
        "X-Houston-Claim-Token": turn.claim.token,
        "X-Houston-Claim-Boot": turn.claim.bootId,
        "X-Houston-Claim-Conversation": turn.conversationId,
        ...(op.action === "rename"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(op.action === "rename"
        ? { body: JSON.stringify({ title: op.title ?? "" }) }
        : {}),
    },
  );
  await response.body?.cancel();
  if (response.ok || response.status === 404) return [];
  return [`transcript ${op.action} rejected (${response.status})`];
}
