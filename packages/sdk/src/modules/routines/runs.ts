/**
 * The RUNS of an agent's routines: the record of the times they fired, firing
 * one now instead of waiting for its schedule, stopping one under way, and the
 * incoming-webhook key an outside service starts one with. The routines
 * themselves — what an agent repeats, and when — live in `http.ts`.
 *
 * One route here is NOT an agent-proxy path: the webhook-key mint is a gateway
 * CONTROL route (`/v1/agents/…`), and the difference is load-bearing (see
 * {@link mintRoutineWebhookKey}).
 *
 * Nothing is swallowed here either: every non-2xx throws a
 * {@link RoutinesHttpError} carrying the HTTP `status`, so the `404` of a
 * gateway that does not serve webhook keys reaches the caller and it decides
 * what that means.
 */

import { type HttpScope, httpRequest } from "../http";
import type { RoutineRun, WebhookKeyReveal } from "./types";

/**
 * Lists the times an agent's routines have run, including any run in progress.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:routines
 */
export async function listRoutineRuns(
  scope: HttpScope,
  agentId: string,
): Promise<RoutineRun[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routine_runs`,
  );
  return ((await res.json()) as { items: RoutineRun[] }).items;
}

/**
 * Runs a routine right now instead of waiting for its next scheduled time.
 *
 * Fire a routine immediately — the host records a routine_run and starts the turn now.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to run now, by the id listRoutines returns.
 * @assistant group:routines
 * @assistant confirm: money. It starts a real run right now, which spends model budget and does whatever the routine instructs.
 */
export async function runRoutineNow(
  scope: HttpScope,
  agentId: string,
  id: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}

/**
 * Stops a routine run that is currently under way.
 *
 * Stop an in-flight routine run — the host flips the row terminal, then aborts the turn.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param routineId The routine, by the id listRoutines returns.
 * @param runId The run to stop, by the id listRoutineRuns returns.
 * @assistant group:routines
 * @assistant confirm: irreversible. The run stops part-way, and what it had not finished waits for the next scheduled time.
 */
export async function cancelRoutineRun(
  scope: HttpScope,
  agentId: string,
  routineId: string,
  runId: string,
): Promise<RoutineRun> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
  return (await res.json()) as RoutineRun;
}

/**
 * Creates a fresh key that lets an outside service start a routine, replacing any key issued before.
 *
 * Mint (or rotate) a routine's incoming-webhook key. Calling again ROTATES: the
 * old secret is invalidated. A gateway that does not serve webhook keys answers
 * 404 like any other failure — the caller degrades that to "webhook keys
 * unsupported here" (the routine's webhook section then stays unmintable) so a
 * host without the backend reads byte-identically.
 *
 * Hidden: the reply carries the raw secret, and an operation the assistant can
 * call is an operation whose result can end up quoted back into a chat.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param routineId The routine, by the id listRoutines returns.
 * @assistant group:routines confirm: irreversible. Minting again invalidates the key already in use, so whatever calls this routine from outside stops working.
 * @assistant hidden: returns a secret; the webhook key is revealed once and calling again rotates it.
 */
export async function mintRoutineWebhookKey(
  scope: HttpScope,
  agentId: string,
  routineId: string,
): Promise<WebhookKeyReveal> {
  // The mint is a GATEWAY control route (`/v1/agents/…`, like trigger-status)
  // — NOT an agent-proxy path: the `/agents/:id` prefix would forward it to the
  // engine pod, which never serves webhook keys, and its 404 would read as
  // "this host can't mint" on a gateway that can (HOU-807).
  const res = await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(routineId)}/webhook-key`,
    { method: "POST" },
  );
  return (await res.json()) as WebhookKeyReveal;
}
