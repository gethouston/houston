import type { ServerResponse } from "node:http";
import type {
  ChatMessage,
  MissionTitleRequest as MissionTitle,
} from "@houston/protocol";
import { readEventStream } from "@houston/runtime-client";
import type { Agent, Workspace } from "../domain/types";
import { isApiKeyCredential, type TurnPin } from "../ports";
import { resolveCloudTurn } from "./cloud-provider";
import { json, prefixFor, type TurnDeps } from "./deps";
import { freshCredential } from "./fresh-credential";
import { TurnQuotaError } from "./quota";

export type TurnStart =
  | { status: "accepted" }
  | { status: "busy" }
  | { status: "duplicate" }
  | { status: "quota"; message: string };

// WHY: Resolve provider and effort before claiming quota, so a bad pin leaks no slot. ADR-0016
export async function dispatchTurn(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  cid: string,
  text: string,
  nonce: string | undefined,
  pin?: TurnPin,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
  missionTitle?: MissionTitle,
): Promise<TurnStart> {
  const prefix = prefixFor(ws, agent);
  const { provider, effort } = await resolveCloudTurn(deps, prefix, pin);
  let release: () => Promise<void>;
  try {
    release = await deps.quota.acquire(ws.id);
  } catch (err) {
    if (err instanceof TurnQuotaError)
      return { status: "quota", message: err.message };
    throw err;
  }
  const key = `${agent.id}/${cid}`;
  try {
    deps.frameForwarder?.capture(cid, key);
  } catch (error) {
    console.debug("[turnlog] relay capture enqueue failed", error);
  }
  const started = await deps.relay.start(
    agent.id,
    key,
    async (publish, signal) => {
      try {
        const cred = await freshCredential(deps, ws.id, provider);
        const idToken = await deps.idToken();
        const upstream = await fetch(
          `${deps.runtimeUrl.replace(/\/$/, "")}/turn`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(deps.turnToken ? { "x-internal-token": deps.turnToken } : {}),
              ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({
              workspaceId: ws.id,
              agentId: agent.id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128),
              conversationId: cid,
              text,
              nonce,
              ...(pin?.model ? { model: pin.model } : {}),
              ...(effort ? { effort } : {}),
              ...(pin?.mode ? { mode: pin.mode } : {}),
              ...(displayText ? { displayText } : {}),
              ...(mentions?.length ? { mentions } : {}),
              ...(missionTitle ? { missionTitle } : {}),
              gcsPrefix: prefix,
              credential: cred
                ? {
                    provider: cred.provider,
                    access: cred.accessToken,
                    expires: cred.expiresAt,
                    accountId: cred.accountId ?? null,
                    kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
                    ...(cred.enterpriseUrl
                      ? { enterpriseUrl: cred.enterpriseUrl }
                      : {}),
                  }
                : null,
            }),
            signal,
          },
        );
        if (!upstream.ok || !upstream.body) {
          throw new Error(
            `turn runtime ${upstream.status}: ${await upstream.text().catch(() => "")}`,
          );
        }
        await readEventStream(upstream.body, publish);
      } finally {
        await release();
      }
    },
    nonce,
  );
  if (!started) {
    await release();
    if (nonce && deps.relay.duplicateSend(agent.id, key, nonce))
      return { status: "duplicate" };
    return { status: "busy" };
  }
  return { status: "accepted" };
}

export async function startTurn(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  cid: string,
  text: string,
  nonce: string | undefined,
  res: ServerResponse,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
  missionTitle?: MissionTitle,
): Promise<void> {
  const outcome = await dispatchTurn(
    deps,
    ws,
    agent,
    cid,
    text,
    nonce,
    undefined,
    displayText,
    mentions,
    missionTitle,
  );
  if (outcome.status === "quota")
    return json(res, 429, { error: outcome.message });
  if (outcome.status === "busy")
    return json(res, 409, {
      error: "a turn is already running for this agent",
    });
  return json(res, 202, { ok: true });
}
