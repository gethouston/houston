import { routinePin, routinePrompt } from "@houston/domain";
import type { WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import { isKnownProvider, routineProviderUnavailable } from "../providers";
import type { FiringJob, RoutineFirer } from "./scheduler";

export class ChannelRoutineFirer implements RoutineFirer {
  constructor(
    private readonly channels: Partial<
      Record<WorkspaceRuntime, RuntimeChannel>
    >,
    private readonly actingAs?: string,
  ) {}

  async fire(job: FiringJob): Promise<void> {
    const channel = this.channels[job.workspace.runtime];
    if (!channel)
      throw new Error(`${job.workspace.runtime} runtime not configured`);
    const createdBy = job.routine.created_by;
    const pin = { ...routinePin(job.routine), mode: "auto" as const };
    if (pin.provider && !isKnownProvider(pin.provider))
      throw new Error(routineProviderUnavailable(pin.provider));
    await channel.fireTurn(
      { workspace: job.workspace, agent: job.agent },
      job.conversationId,
      routinePrompt(job.routine),
      { ...pin, effort: job.routine.effort },
      this.actingAs
        ? { actingAs: this.actingAs, routine: true }
        : { actingUser: createdBy, routine: true },
    );
  }
}
