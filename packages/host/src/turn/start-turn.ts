import type { ServerResponse } from "node:http";
import { readEventStream } from "@houston/runtime-client";
import { isExpiring } from "../credentials/refresh";
import type { Agent, Workspace } from "../domain/types";
import {
  isApiKeyCredential,
  type TurnPin,
  type WorkspaceCredential,
} from "../ports";
import { isCloudProvider } from "../providers";
import { json, PROVIDER, prefixFor, readSettings, type TurnDeps } from "./deps";
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

/**
 * The provider a cloud turn should run: the agent's saved active provider when
 * it's one the cloud runtime offers, else Codex (the cloud default). Anthropic
 * is never served in cloud (ToS), so a stale anthropic setting falls back too.
 */
async function activeCloudSettings(
  deps: TurnDeps,
  prefix: string,
): Promise<{ provider: string; effort?: string }> {
  const settings = await readSettings(deps, prefix);
  const saved = settings.activeProvider;
  const provider = saved && isCloudProvider(saved) ? saved : PROVIDER;
  return { provider, effort: settings.effort };
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
): Promise<TurnStart> {
  // A pinned provider the cloud runtime can't serve fails the turn VISIBLY,
  // before any quota/slot is claimed — the firer marks the run errored with
  // this message. Substituting the saved provider here would be exactly the
  // silent switch the pin exists to prevent (and would send the pinned MODEL
  // to a provider that doesn't offer it).
  if (pin?.provider && !isCloudProvider(pin.provider)) {
    throw new Error(
      `${pin.provider} is not available for cloud agents — edit the routine to pick another provider`,
    );
  }
  let release: () => Promise<void>;
  try {
    release = await deps.quota.acquire(ws.id);
  } catch (err) {
    if (err instanceof TurnQuotaError)
      return { status: "quota", message: err.message };
    throw err;
  }
  const prefix = prefixFor(ws, agent);
  const { provider: savedProvider, effort: savedEffort } =
    await activeCloudSettings(deps, prefix);
  // The routine's pinned provider wins (validated cloud-servable above). The
  // pin is per-turn: it never writes settings, so the agent's saved pick is
  // untouched.
  const provider = pin?.provider ?? savedProvider;
  // The routine's pinned effort wins; otherwise the agent's saved effort is
  // baked into the turn so a normal cloud message honors the picker selection.
  const effort = pin?.effort ?? savedEffort;
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
              // Model/effort for this turn (omitted when absent → runtime inherits).
              ...(pin?.model ? { model: pin.model } : {}),
              ...(effort ? { effort } : {}),
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
): Promise<void> {
  const outcome = await dispatchTurn(deps, ws, agent, cid, text, nonce);
  if (outcome.status === "quota")
    return json(res, 429, { error: outcome.message });
  if (outcome.status === "busy")
    return json(res, 409, {
      error: "a turn is already running for this agent",
    });
  return json(res, 202, { ok: true });
}
