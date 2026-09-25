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
  FirstDayRefusalCode,
  FirstDayStartInput,
  FirstDayStartResult,
  HoustonEvent,
} from "@houston/protocol";
import { isTurnBusyIn } from "../channel/fire-error";
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

/**
 * Starting an AI Employee's first day, on the host that holds the employee, so
 * every surface and the AI Manager start it the same way and the decision is
 * made once, where the files are.
 *
 * One start per employee at a time: the whole operation runs under the
 * employee's first-day lock, so a second start (another tab, another button,
 * a retried request) waits and then finds the task the first one made. The
 * task is created and its first turn fired BEFORE the start is recorded, so a
 * failed start leaves the first day pending with no card behind it, and a
 * recorded start always has its task running. A task that exists while the
 * config still says pending is one whose start never recorded its turn (the
 * host stopped between the two, or the record failed): it gets its first turn
 * and the record, never a second task, and it never leaves the board. When the
 * agent is busy with THAT task's conversation, its turn is the first day under
 * way, so the start is recorded; a slot busy with any other conversation, or
 * any other failure, leaves it for the next start. The rare
 * record that fails after an accepted turn can therefore greet twice on the
 * next start, which beats a first day recorded as started with nothing ever
 * running.
 */

export interface FirstDayStartDeps {
  vfs: Vfs;
  root: string;
  workspace: Workspace;
  agent: Agent;
  channel: RuntimeChannel;
  /** Stamped onto the task as its creator (gateway-fronted pods only). */
  author: ActivityContributor | undefined;
  /** Whose name the first turn works in: a bare sub, or the gateway token. */
  actingUser: string | undefined;
  actingAs: string | undefined;
  emit: ((event: HoustonEvent) => void) | undefined;
}

export type FirstDayStartAnswer =
  | { ok: true; status: 200 | 201; result: FirstDayStartResult }
  | { ok: false; status: 409; code: FirstDayRefusalCode; error: string };

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
    // A task that was already there is never taken off the board: its turn
    // may be the one running (the agent's slot is busy with its own
    // conversation), which is a first day under way; a slot another
    // conversation holds, or any other failure, leaves it for the next start.
    // Only the task this call created goes, so a failed start leaves no card.
    if (!existing) await dropTask(deps, task.id);
    else if (isTurnBusyIn(err, missionConversationKey(task)))
      return recordAndAnswer(deps, task, config, role);
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      // A domain refusal, never a gateway status: the transport retries a
      // 5xx on this idempotent write, which would fire the turn again.
      status: 409,
      code: "first_day_not_started",
      error: `the first day could not start: ${reason}`,
    };
  }
  return recordAndAnswer(deps, task, config, role);
}

/** Record the start of a task whose first turn is running, and answer it. */
async function recordAndAnswer(
  deps: FirstDayStartDeps,
  task: Activity,
  config: AgentConfig,
  role: string | null,
): Promise<FirstDayStartAnswer> {
  try {
    await recordStarted(deps);
  } catch (err) {
    // The task is running, so the start happened; the next start finds the
    // task with the first day still pending and completes this record.
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
