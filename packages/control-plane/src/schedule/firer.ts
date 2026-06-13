import type { WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import type { FiringJob, RoutineFirer } from "./scheduler";

/**
 * Fires a routine through the SAME per-workspace channel a user message uses —
 * so a scheduled run and a hand-typed message reach the runtime identically.
 * A missing channel (hosting model not wired) or a busy/quota/transport failure
 * throws, and the scheduler records an errored run (never a silent miss).
 */
export class ChannelRoutineFirer implements RoutineFirer {
  constructor(private readonly channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>) {}

  async fire(job: FiringJob): Promise<void> {
    const channel = this.channels[job.workspace.runtime];
    if (!channel) throw new Error(`${job.workspace.runtime} runtime not configured`);
    await channel.fireTurn(
      { workspace: job.workspace, agent: job.agent },
      job.conversationId,
      job.routine.prompt,
    );
  }
}
