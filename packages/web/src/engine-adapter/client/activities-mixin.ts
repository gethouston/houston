import type {
  Activity,
  ActivityUpdate,
  AllConversationsResult,
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
      // NEVER a product name: this registry is localStorage-backed while the
      // ACTIVITIES below come from the host, so a real agent misses here and
      // the old `?? "Houston"` put the product's name on every card. The path
      // is at least the agent's own identity; the app resolves the display
      // name from the workspace roster anyway (`board/mission-card-agent.ts`).
      const agentName = agents.agentNameByPath(agentPath) ?? agentPath;
      // The board/missions list is derived from activities; in cloud those live on
      // the host (this.listActivities un-fakes it), not localStorage.
      const acts = await this.listActivities(agentPath);
      return acts.map((a) =>
        activities.activityToConversation(a, agentPath, agentName),
      );
    }
    /**
     * The cross-agent sweep: one read per agent, in parallel.
     *
     * PARTIAL-TOLERANT by contract (HOU-981). `Promise.all` rejected the whole
     * sweep when a SINGLE agent's read failed — one pod that never woke blanked
     * Mission Control, the sidebar badges, and the command palette for everyone
     * else. `allSettled` keeps every agent that answered and REPORTS the ones
     * that didn't, so the query layer can hold the failed agents' last-known
     * rows and schedule a re-sweep instead of freezing a hole in cache.
     *
     * A sweep where EVERY agent failed is not partial — it is a failure, and it
     * throws (the first reason) so the caller's error path runs.
     */
    async listAllConversations(
      agentPaths: string[],
    ): Promise<AllConversationsResult> {
      const settled = await Promise.allSettled(
        agentPaths.map((p) => this.listConversations(p)),
      );
      const conversations: ConversationEntry[] = [];
      const failedAgentPaths: string[] = [];
      let firstReason: unknown;
      settled.forEach((outcome, i) => {
        if (outcome.status === "fulfilled") {
          conversations.push(...outcome.value);
          return;
        }
        failedAgentPaths.push(agentPaths[i]);
        if (firstReason === undefined) firstReason = outcome.reason;
        // Never a silent drop: the agent is named in the log, and the caller
        // gets it in `failedAgentPaths` to surface + recover from.
        console.warn(
          `[activities] conversations read failed for ${agentPaths[i]}: ${String(
            outcome.reason,
          )}`,
        );
      });
      if (
        agentPaths.length > 0 &&
        failedAgentPaths.length === agentPaths.length
      )
        throw firstReason;
      return { conversations, failedAgentPaths };
    }
  }
  return Activities;
}
