import { routinePin, routineTriggerPrompt } from "@houston/domain";
import type { WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import { isKnownProvider, routineProviderUnavailable } from "../providers";
import type { FiringJob, RoutineFirer } from "../schedule/scheduler";
import type { TriggerEvent } from "./fire";

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
    if (pin.provider && !isKnownProvider(pin.provider))
      throw new Error(routineProviderUnavailable(pin.provider));
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
