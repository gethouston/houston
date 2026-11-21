import type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
  WebhookKeyReveal,
} from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function RoutinesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Routines extends Base {
    async listRoutines(agentPath: string) {
      if (this.ctx.cp)
        return viaSdk(`${controlPlane.agentPath(agentPath)}/routines`, () =>
          this.ctx.sdk.routines.listRoutines(agentPath),
        );
      return [];
    }
    async listRoutineRuns(agentPath: string) {
      if (this.ctx.cp)
        return viaSdk(`${controlPlane.agentPath(agentPath)}/routine_runs`, () =>
          this.ctx.sdk.routines.listRoutineRuns(agentPath),
        );
      return [];
    }
    async createRoutine(
      agentPath: string,
      input: NewRoutine,
    ): Promise<Routine> {
      if (!this.ctx.cp) return {} as Routine;
      const routine = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/routines`,
        () => this.ctx.sdk.routines.createRoutine(agentPath, input),
      );
      emitLocalEcho("RoutinesChanged", { agentPath });
      return routine;
    }
    async updateRoutine(
      agentPath: string,
      id: string,
      updates: RoutineUpdate,
    ): Promise<Routine> {
      if (!this.ctx.cp) return {} as Routine;
      const routine = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/routines/${encodeURIComponent(id)}`,
        () => this.ctx.sdk.routines.updateRoutine(agentPath, id, updates),
      );
      emitLocalEcho("RoutinesChanged", { agentPath });
      return routine;
    }
    async deleteRoutine(agentPath: string, id: string): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(
        `${controlPlane.agentPath(agentPath)}/routines/${encodeURIComponent(id)}`,
        () => this.ctx.sdk.routines.deleteRoutine(agentPath, id),
      );
      emitLocalEcho("RoutinesChanged", { agentPath });
    }
    async runRoutineNow(agentPath: string, routineId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Running a routine needs a cloud workspace.");
      await viaSdk(
        `${controlPlane.agentPath(agentPath)}/routines/${encodeURIComponent(routineId)}/run`,
        () => this.ctx.sdk.routines.runRoutineNow(agentPath, routineId),
      );
      emitLocalEcho("RoutineRunsChanged", { agentPath });
    }
    async cancelRoutineRun(
      agentPath: string,
      routineId: string,
      runId: string,
    ): Promise<RoutineRun> {
      if (!this.ctx.cp)
        throw new Error("Stopping a routine run needs a cloud workspace.");
      const run = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/cancel`,
        () =>
          this.ctx.sdk.routines.cancelRoutineRun(agentPath, routineId, runId),
      );
      emitLocalEcho("RoutineRunsChanged", { agentPath });
      return run;
    }
    async mintRoutineWebhookKey(
      agentPath: string,
      routineId: string,
    ): Promise<WebhookKeyReveal | null> {
      if (!this.ctx.cp) return null;
      try {
        return await viaSdk(
          `/v1/agents/${encodeURIComponent(agentPath)}/routines/${encodeURIComponent(routineId)}/webhook-key`,
          () =>
            this.ctx.sdk.routines.mintRoutineWebhookKey(agentPath, routineId),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404)
          return null;
        throw err;
      }
    }
  }
  return Routines;
}
