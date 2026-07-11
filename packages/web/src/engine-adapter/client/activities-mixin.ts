import type {
  Activity,
  ActivityUpdate,
  ConversationEntry,
  NewActivity,
} from "../../../../../ui/engine-client/src/types";
import * as activities from "../activities";
import * as agents from "../agents";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { deleteCachedConversation } from "../conversation-cache";
import type { BaseCtor } from "./mixin";

export function ActivitiesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Activities extends Base {
    // ---- activities (board / missions) ----
    // Cloud: the host serves them off the agent's workspace (.houston/activity).
    // Standalone web: localStorage-backed (no host).
    async listActivities(agentPath: string): Promise<Activity[]> {
      if (this.ctx.cp)
        return controlPlane.listActivities(this.ctx.cp, agentPath);
      return activities.listActivities(agentPath);
    }
    async createActivity(
      agentPath: string,
      input: NewActivity,
    ): Promise<Activity> {
      // SDK delegates the wire write (byte-identical POST
      // /agents/:id/activities, no refetch); web keeps its own write-through
      // echo. Standalone (no host) stays localStorage-backed.
      const activity = this.ctx.cp
        ? await this.ctx.sdk.activities.writes.create(agentPath, input)
        : activities.createActivity(agentPath, input);
      emitLocalEcho("ActivityChanged", { agentPath });
      return activity;
    }
    async updateActivity(
      agentPath: string,
      id: string,
      updates: ActivityUpdate,
    ): Promise<Activity> {
      const activity = this.ctx.cp
        ? await controlPlane.updateActivity(this.ctx.cp, agentPath, id, updates)
        : activities.updateActivity(agentPath, id, updates);
      emitLocalEcho("ActivityChanged", { agentPath });
      return activity;
    }
    async deleteActivity(agentPath: string, id: string): Promise<void> {
      // SDK delegates the wire write (byte-identical DELETE
      // /agents/:id/activities/:id, no refetch).
      if (this.ctx.cp)
        await this.ctx.sdk.activities.writes.delete(agentPath, id);
      else activities.deleteActivity(agentPath, id);
      // The user deleted the chat — THIS is when its locally cached transcript
      // goes too (a server 404 alone no longer drops it, HOU-731). Missions
      // key their conversation `activity-<id>` (see setActivityStatus).
      if (this.ctx.cp)
        void deleteCachedConversation(agentPath, `activity-${id}`);
      emitLocalEcho("ActivityChanged", { agentPath });
    }

    // ---- conversations (derived from activities) ----
    async listConversations(agentPath: string): Promise<ConversationEntry[]> {
      const agentName = agents.agentNameByPath(agentPath) ?? "Houston";
      // The board/missions list is derived from activities; in cloud those live on
      // the host (this.listActivities un-fakes it), not localStorage.
      const acts = await this.listActivities(agentPath);
      return acts.map((a) =>
        activities.activityToConversation(a, agentPath, agentName),
      );
    }
    async listAllConversations(
      agentPaths: string[],
    ): Promise<ConversationEntry[]> {
      const all = await Promise.all(
        agentPaths.map((p) => this.listConversations(p)),
      );
      return all.flat();
    }
  }
  return Activities;
}
