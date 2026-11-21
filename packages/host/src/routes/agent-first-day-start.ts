import {
  AGENT_SETUP_AGENT_MODE,
  firstDayBrief,
  loadActivities,
  loadConfig,
  missionConversationKey,
  withDocLock,
} from "@houston/domain";
import type {
  Activity,
  ActivityContributor,
  AgentConfig,
  FirstDayRefusal,
  FirstDayStartInput,
  FirstDayStartResult,
  HoustonEvent,
  TurnLimits,
} from "@houston/protocol";
import { isTurnBusyIn, TurnFireError } from "../channel/fire-error";
import type { Agent, Workspace } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import type { Vfs } from "../vfs";
import {
  dropTask,
  recordStarted,
  resultFor,
  saveTask,
} from "./agent-first-day-records";
import { fireFirstTurn, newSetupTask } from "./agent-first-day-turn";

export interface FirstDayStartDeps {
  vfs: Vfs;
  root: string;
  workspace: Workspace;
  agent: Agent;
  channel: RuntimeChannel;
  author: ActivityContributor | undefined;
  actingUser: string | undefined;
  actingAs: string | undefined;
  limits?: TurnLimits | undefined;
  emit: ((event: HoustonEvent) => void) | undefined;
}

export type FirstDayStartAnswer =
  | { ok: true; status: 200 | 201; result: FirstDayStartResult }
  | ({ ok: false; status: 409 } & FirstDayRefusal);

const NO_PROVIDER_ERROR =
  "No AI is connected to run the first day. Connect one, then start it again.";

export function startFirstDay(
  deps: FirstDayStartDeps,
  input: FirstDayStartInput,
): Promise<FirstDayStartAnswer> {
  return withDocLock(`${deps.root}#first-day`, () => run(deps, input));
}

async function run(
  deps: FirstDayStartDeps,
  input: FirstDayStartInput,
): Promise<FirstDayStartAnswer> {
  const { vfs, root } = deps;
  const { config } = await loadConfig(vfs, root);
  const brief = firstDayBrief(await vfs.readText(`${root}/CLAUDE.md`));
  const role = brief?.role ?? null;
  const { items } = await loadActivities(vfs, root);
  const existing = items.find((a) => a.agent === AGENT_SETUP_AGENT_MODE);
  if (existing && config.firstDay !== "pending") {
    return {
      ok: true,
      status: 200,
      result: resultFor("existing", existing, config, role),
    };
  }
  if (config.firstDay !== "pending") {
    return {
      ok: false,
      status: 409,
      code: "first_day_not_pending",
      error: `${deps.agent.name} has no first day waiting to start`,
    };
  }

  const task = existing ?? newSetupTask(deps, input, config);
  if (!existing) await saveTask(deps, task);
  try {
    await fireFirstTurn(deps, task, config, brief, input);
  } catch (err) {
    if (!existing) await dropTask(deps, task.id);
    else if (isTurnBusyIn(err, missionConversationKey(task)))
      return recordAndAnswer(deps, task, config, role);
    if (err instanceof TurnFireError && err.code === "no_provider")
      return {
        ok: false,
        status: 409,
        code: "first_day_no_provider",
        error: NO_PROVIDER_ERROR,
        ...(err.provider ? { provider: err.provider } : {}),
      };
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 409,
      code: "first_day_not_started",
      error: `the first day could not start: ${reason}`,
    };
  }
  return recordAndAnswer(deps, task, config, role);
}

async function recordAndAnswer(
  deps: FirstDayStartDeps,
  task: Activity,
  config: AgentConfig,
  role: string | null,
): Promise<FirstDayStartAnswer> {
  try {
    await recordStarted(deps);
  } catch (err) {
    console.error(
      `[first-day] recording the start failed for ${deps.agent.id}:`,
      err,
    );
  }
  return {
    ok: true,
    status: 201,
    result: resultFor("started", task, config, role),
  };
}
