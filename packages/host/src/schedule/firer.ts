import { routinePin, routinePrompt } from "@houston/domain";
import type { WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import { hostProvider } from "../providers";
import type { FiringJob, RoutineFirer } from "./scheduler";

/**
 * Fires a routine through the SAME per-workspace channel a user message uses —
 * so a scheduled run and a hand-typed message reach the runtime identically.
 * A missing channel (hosting model not wired) or a busy/quota/transport failure
 * throws, and the scheduler records an errored run (never a silent miss).
 */
export class ChannelRoutineFirer implements RoutineFirer {
  constructor(
    private readonly channels: Partial<
      Record<WorkspaceRuntime, RuntimeChannel>
    >,
  ) {}

  async fire(job: FiringJob): Promise<void> {
    const channel = this.channels[job.workspace.runtime];
    if (!channel)
      throw new Error(`${job.workspace.runtime} runtime not configured`);
    // The suppression instruction (when opted in) rides on the prompt so the
    // agent knows to emit ROUTINE_OK for a silent run — reconcile reads it back.
    // The routine's provider/model/effort pins ride alongside (absent =
    // inherit), with routinePin applying the read-time legacy id mapping —
    // the pin is what makes a routine's provider stick regardless of what
    // other chats or routines have picked since.
    // The creator's sub (C2) is threaded as the turn's acting-user so integration
    // calls act as them; absent for legacy creator-less routines → acts as owner.
    const createdBy = job.routine.created_by;
    const pin = routinePin(job.routine);
    // A pin that resolves to no known provider (junk or a legacy id no alias
    // maps — routinePin passes those through verbatim) fails the run RIGHT
    // HERE with the real reason: fireRoutineRun marks the run errored with
    // this message. Firing it anyway would die inside the runtime as an
    // ephemeral stream error nobody persists, and the run would wait out the
    // 15-minute timeout with a vague message.
    if (pin.provider && !hostProvider(pin.provider)) {
      throw new Error(
        `unknown provider: ${pin.provider} — edit the routine and pick a provider`,
      );
    }
    await channel.fireTurn(
      { workspace: job.workspace, agent: job.agent },
      job.conversationId,
      routinePrompt(job.routine),
      { ...pin, effort: job.routine.effort },
      createdBy,
    );
  }
}
