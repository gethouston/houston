import { routinePin, routineTriggerPrompt } from "@houston/domain";
import type { WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import { isKnownProvider, routineProviderUnavailable } from "../providers";
import type { FiringJob, RoutineFirer } from "../schedule/scheduler";
import type { TriggerEvent } from "./fire";

/**
 * The firer for an event-woken run: identical to `ChannelRoutineFirer` except it
 * frames the batch's events into the prompt (`routineTriggerPrompt`) instead of
 * the plain `routinePrompt`. Kept separate because the prompt IS the difference
 * and the scheduler's firer is prompt-fixed. Fires through the SAME per-workspace
 * channel a user message uses, pinning Autopilot (routine turns never block on
 * ask_user) and the routine's provider/model/effort.
 */
export class TriggerRoutineFirer implements RoutineFirer {
  constructor(
    private readonly channels: Partial<
      Record<WorkspaceRuntime, RuntimeChannel>
    >,
    private readonly events: TriggerEvent[],
    private readonly actingAs?: string,
  ) {}

  async fire(job: FiringJob): Promise<void> {
    const channel = this.channels[job.workspace.runtime];
    if (!channel)
      throw new Error(`${job.workspace.runtime} runtime not configured`);
    const pin = { ...routinePin(job.routine), mode: "auto" as const };
    // A pin resolving to no known provider fails the run HERE with the real
    // reason (parity with ChannelRoutineFirer) rather than as an opaque
    // runtime stream error nobody persists.
    if (pin.provider && !isKnownProvider(pin.provider))
      throw new Error(routineProviderUnavailable(pin.provider));
    // The minted token replaces the bare creator header (ChannelRoutineFirer
    // parity): the runtime reads acting-as for the credential scope.
    await channel.fireTurn(
      { workspace: job.workspace, agent: job.agent },
      job.conversationId,
      routineTriggerPrompt(job.routine, this.events),
      { ...pin, effort: job.routine.effort },
      this.actingAs
        ? { actingAs: this.actingAs, routine: true }
        : { actingUser: job.routine.created_by, routine: true },
    );
  }
}
