/**
 * An AI Employee's first day: the setup task where it introduces itself and
 * interviews the user about how it should work. A new hire is born with its
 * first day pending (`AgentCreateInput.config`), and this is the ONE way it
 * starts, for every surface and the AI Manager alike.
 *
 * The host decides everything: it creates the task, fires its first turn on
 * the brain the employee was hired with, and records the start, all in one
 * operation under the employee's own lock. So a repeated start (a second
 * button, a second tab, a retry after a lost answer) is safe by construction:
 * it hands back the task the first start made, with `outcome: "existing"`.
 * That is also why the start, unlike other writes, rides out a pod that is
 * still coming up: a new hire's first day is offered the moment it is created,
 * often seconds before its pod answers, and a repeated start can only hand back
 * the same task.
 */

import type {
  FirstDayStartInput,
  FirstDayStartResult,
} from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import {
  retryWriteWhileRefused,
  WAKING_CREATE_RETRY_MS,
} from "../activities/busy-retry";
import { type HttpScope, httpRequest } from "../http";
import { field, requireString } from "../payload";
import { AgentsCommand } from "./types";

export type { FirstDayStartInput, FirstDayStartResult };

/**
 * Starts an AI Employee's first day: its setup task, where it introduces
 * itself and works out with the user how it should help. Only a new hire whose
 * first day is still waiting can start one; asking again for one that already
 * started hands back the same task instead of making another. A new hire's
 * first day can be started right after it is created: while the new agent is
 * still getting ready, the start waits for it (up to about a minute and a half).
 * The first day runs on an AI the person has connected (Claude, ChatGPT and
 * the like): with none connected the start is refused with
 * `first_day_no_provider` and the first day stays waiting, so connect an AI
 * first, then start it again. When the connected AI cannot be reached right
 * now the start is refused with `first_day_provider_unavailable` and the first
 * day stays waiting: start it again after about a minute. When the provider
 * blocks the person's account the start is refused with
 * `provider_account_blocked`: fix it at that provider or connect another AI.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param input `locale` is the user's app language (for example "es"), which
 *   the whole first conversation is held in; `title` is the task's name on the
 *   board, in that language. Both are optional.
 * @assistant group:agents
 * @assistant confirm: money. It starts a real conversation right away, which spends model budget.
 */
export async function startFirstDay(
  scope: HttpScope,
  agentId: string,
  input: FirstDayStartInput = {},
): Promise<FirstDayStartResult> {
  const res = await retryWriteWhileRefused(
    scope.ports.clock,
    () =>
      httpRequest(scope, `/agents/${encodeURIComponent(agentId)}/first-day`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    // Idempotent on the host, so a waking refusal is safe to re-issue.
    // `first_day_provider_unavailable` is not re-issued: its Retry-After is
    // about a minute, and an earlier retry only reads the same failure, so
    // the person retries instead.
    { wakingLadderMs: WAKING_CREATE_RETRY_MS },
  );
  return (await res.json()) as FirstDayStartResult;
}

/** The start input off an untrusted command payload; absent means none. */
export function firstDayStartInput(payload: unknown): FirstDayStartInput {
  const value = field(payload, "input");
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null)
    throw new Error("'input' must be an object");
  const { locale, title } = value as Record<string, unknown>;
  for (const [key, text] of Object.entries({ locale, title })) {
    if (text !== undefined && typeof text !== "string")
      throw new Error(`'input.${key}' must be a string`);
  }
  return {
    ...(typeof locale === "string" ? { locale } : {}),
    ...(typeof title === "string" ? { title } : {}),
  };
}

/** The first-day half of the agents facade. */
export interface AgentsFirstDay {
  startFirstDay(
    agentId: string,
    input?: FirstDayStartInput,
  ): Promise<FirstDayStartResult>;
}

export function createAgentsFirstDay(
  ctx: ModuleContext,
  scope: HttpScope,
): AgentsFirstDay {
  ctx.registerCommand(AgentsCommand.StartFirstDay, (p) =>
    startFirstDay(scope, requireString(p, "agentId"), firstDayStartInput(p)),
  );
  return {
    startFirstDay: (agentId, input) => startFirstDay(scope, agentId, input),
  };
}
