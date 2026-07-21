import type {
  CreateSkillRequest,
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineUpdate,
  SaveSkillRequest,
  SkillDetail,
  WebhookKeyReveal,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function RoutinesSkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class RoutinesSkills extends Base {
    // ---- routines / skills ----
    async listRoutines(agentPath: string) {
      if (this.ctx.cp) return controlPlane.listRoutines(this.ctx.cp, agentPath);
      return [];
    }
    async listRoutineRuns(agentPath: string) {
      if (this.ctx.cp)
        return controlPlane.listRoutineRuns(this.ctx.cp, agentPath);
      return [];
    }
    async listSkills(agentPath: string) {
      if (this.ctx.cp) return controlPlane.listSkills(this.ctx.cp, agentPath);
      return [];
    }
    async loadSkill(agentPath: string, name: string): Promise<SkillDetail> {
      if (this.ctx.cp)
        return controlPlane.loadSkill(this.ctx.cp, agentPath, name);
      // Standalone web has no skill backend (nothing is listed), so this is
      // unreachable; return an empty detail rather than crash if it ever isn't.
      return { name, title: null, description: "", version: 1, content: "" };
    }

    // Routine + skill mutations route to the host (cloud); standalone web has no
    // routine/skill backend, so they no-op there (the UI still navigates).
    async createRoutine(
      agentPath: string,
      input: NewRoutine,
    ): Promise<Routine> {
      if (!this.ctx.cp) return {} as Routine;
      const routine = await controlPlane.createRoutine(
        this.ctx.cp,
        agentPath,
        input,
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
      const routine = await controlPlane.updateRoutine(
        this.ctx.cp,
        agentPath,
        id,
        updates,
      );
      emitLocalEcho("RoutinesChanged", { agentPath });
      return routine;
    }
    async deleteRoutine(agentPath: string, id: string): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.deleteRoutine(this.ctx.cp, agentPath, id);
      emitLocalEcho("RoutinesChanged", { agentPath });
    }
    /** Fire a routine on demand: the host records a routine_run and starts the turn now. */
    async runRoutineNow(agentPath: string, routineId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Running a routine needs a cloud workspace.");
      await controlPlane.runRoutineNow(this.ctx.cp, agentPath, routineId);
      emitLocalEcho("RoutineRunsChanged", { agentPath });
    }
    /** Stop an in-flight routine run: the host flips the row terminal, then aborts the turn. */
    async cancelRoutineRun(
      agentPath: string,
      routineId: string,
      runId: string,
    ): Promise<RoutineRun> {
      if (!this.ctx.cp)
        throw new Error("Stopping a routine run needs a cloud workspace.");
      const run = await controlPlane.cancelRoutineRun(
        this.ctx.cp,
        agentPath,
        routineId,
        runId,
      );
      emitLocalEcho("RoutineRunsChanged", { agentPath });
      return run;
    }
    /**
     * Mint (or rotate) a routine's incoming-webhook key. Degrades to `null` when
     * webhook keys are unsupported here: no gateway (standalone web/desktop) or a
     * gateway that 404s the route. Calling again ROTATES the old secret away.
     */
    async mintRoutineWebhookKey(
      agentPath: string,
      routineId: string,
    ): Promise<WebhookKeyReveal | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.mintRoutineWebhookKey(
        this.ctx.cp,
        agentPath,
        routineId,
      );
    }
    async createSkill(req: CreateSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.createSkill(this.ctx.cp, req.workspacePath, {
        name: req.name,
        description: req.description,
        content: req.content,
      });
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.saveSkill(
        this.ctx.cp,
        req.workspacePath,
        name,
        req.content,
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async deleteSkill(workspacePath: string, name: string): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.deleteSkill(this.ctx.cp, workspacePath, name);
      emitLocalEcho("SkillsChanged", { agentPath: workspacePath });
    }
  }
  return RoutinesSkills;
}
