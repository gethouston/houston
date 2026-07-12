import type { ServerResponse } from "node:http";
import { readEventStream } from "@houston/runtime-client";
import { isExpiring } from "../credentials/refresh";
import type { Agent, Workspace } from "../domain/types";
import {
  isApiKeyCredential,
  type TurnPin,
  type WorkspaceCredential,
} from "../ports";
import { resolveCloudTurn } from "./cloud-provider";
import { json, prefixFor, type TurnDeps } from "./deps";
import { TurnQuotaError } from "./quota";

/**
 * Fire one turn against the per-turn runtime: claim the workspace quota and
 * the per-agent relay slot, build the self-contained POST /turn (short-TTL
 * access credential included), and pump the runtime's SSE frames into the
 * relay where this conversation's subscribers receive them.
 */

/**
 * The workspace's credential for `provider`, refreshed centrally when expiring
 * (an API-key credential never expires, so it's served as-is). Null = the
 * workspace hasn't connected that provider.
 */
export async function freshCredential(
  deps: TurnDeps,
  wsId: string,
  provider: string,
): Promise<WorkspaceCredential | null> {
  let cred = await deps.credentials.get(wsId, provider);
  if (!cred) return null;
  if (isExpiring(cred)) {
    cred = await deps.refresh(cred);
    await deps.credentials.put(cred);
  }
  return cred;
}

/** Outcome of asking the per-turn runtime to start a turn. */
export type TurnStart =
  | { status: "accepted" }
  | { status: "busy" }
  | { status: "quota"; message: string };

/**
 * The transport-free core: claim the quota + relay slot and kick off the POST
 * /turn (the runtime streams back through the relay). Returns an outcome rather
 * than writing HTTP, so BOTH the user-message route (startTurn → status code)
 * and the scheduler's routine firer (RoutineFirer → run record) share one path.
 */
export async function dispatchTurn(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  cid: string,
  text: string,
  nonce: string | undefined,
  pin?: TurnPin,
  displayText?: string,
): Promise<TurnStart> {
  const prefix = prefixFor(ws, agent);
  // Resolve the provider (+ effort) for this turn BEFORE claiming the quota/relay
  // slot: an unservable pin, or a saved openai-compatible with no endpoint, fails
  // VISIBLY here (the firer marks the run errored) and leaks no slot. resolveCloudTurn
  // NEVER silently substitutes Codex for the user's real pick — the routine's pin
  // wins over the agent's saved active provider, and neither writes settings.
  const { provider, effort } = await resolveCloudTurn(deps, prefix, pin);
  let release: () => Promise<void>;
  try {
    release = await deps.quota.acquire(ws.id);
  } catch (err) {
    if (err instanceof TurnQuotaError)
      return { status: "quota", message: err.message };
    throw err;
  }
  const started = await deps.relay.start(
    agent.id,
    `${agent.id}/${cid}`,
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
              agentId: agent.id,
              conversationId: cid,
              text,
              nonce,
              // Model/effort/mode for this turn (omitted when absent →
              // runtime inherits/defaults).
              ...(pin?.model ? { model: pin.model } : {}),
              ...(effort ? { effort } : {}),
              ...(pin?.mode ? { mode: pin.mode } : {}),
              // Presentation-only bubble text — the runtime persists it beside
              // the user message; the model still runs on `text`.
              ...(displayText ? { displayText } : {}),
              gcsPrefix: prefix,
              credential: cred
                ? {
                    provider: cred.provider,
                    access: cred.accessToken,
                    expires: cred.expiresAt,
                    accountId: cred.accountId ?? null,
                    kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
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
        // Each frame is awaited into the relay (sequence → persist snapshot →
        // broadcast) before the next is parsed, preserving stream order. The
        // runtime's frames arrive seq-less with a turnId; the relay stamps seq
        // itself and turnId rides the envelope through.
        await readEventStream(upstream.body, publish);
      } finally {
        await release();
      }
    },
  );
  if (!started) {
    await release();
    return { status: "busy" };
  }
  return { status: "accepted" };
}

/** The user-message route: dispatch a turn and map the outcome to a status code. */
export async function startTurn(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  cid: string,
  text: string,
  nonce: string | undefined,
  res: ServerResponse,
  displayText?: string,
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
  );
  if (outcome.status === "quota")
    return json(res, 429, { error: outcome.message });
  if (outcome.status === "busy")
    return json(res, 409, {
      error: "a turn is already running for this agent",
    });
  return json(res, 202, { ok: true });
}
