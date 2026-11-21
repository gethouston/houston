import { missionConversationId } from "@houston/domain";
import {
  type CreateActivityOptions,
  titleMissionFromClient,
} from "@houston/sdk";
import type {
  Activity,
  ActivityUpdate,
  AllConversationsResult,
  ConversationEntry,
  FailedAgentRead,
  MissionTitle,
  NewActivity,
} from "@houston/wire-types";
import * as activities from "../activities";
import * as agents from "../agents";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { deleteCachedConversation } from "../conversation-cache";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function ActivitiesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Activities extends Base {
    async listActivities(agentPath: string): Promise<Activity[]> {
      if (this.ctx.cp)
        return viaSdk(`${controlPlane.agentPath(agentPath)}/activities`, () =>
          this.ctx.sdk.activities.list(agentPath),
        );
      return activities.listActivities(agentPath);
    }
    async createActivity(
      agentPath: string,
      input: NewActivity,
      opts?: CreateActivityOptions,
    ): Promise<Activity> {
      const activity = this.ctx.cp
        ? await viaSdk(`${controlPlane.agentPath(agentPath)}/activities`, () =>
            this.ctx.sdk.activities.writes.create(agentPath, input, opts),
          )
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
        ? await viaSdk(
            `${controlPlane.agentPath(agentPath)}/activities/${encodeURIComponent(id)}`,
            () => this.ctx.sdk.activities.writes.update(agentPath, id, updates),
          )
        : activities.updateActivity(agentPath, id, updates);
      emitLocalEcho("ActivityChanged", { agentPath });
      return activity;
    }
    /**
     * @assistant hidden: it spends a model turn retitling a mission the app just created; the title a person ends up with is theirs to set.
     *
     * The client half of the SDK's `planMissionTitle`: once a new mission's
     * card row has landed, title it from the runtime's answer (`POST
     * /agents/:id/title`, then the PATCH). A no-op when the plan left the
     * title to the server (`title` undefined). Never throws.
     */
    async titleMissionFromClient(
      agentPath: string,
      activityId: string,
      title: MissionTitle | undefined,
    ): Promise<void> {
      if (!title) return;
      const scope = this.ctx.cp ? agentPath : "";
      await titleMissionFromClient(title, {
        suggestTitle: (text) =>
          this.ctx.sdk.conversations.suggestTitle(scope, text),
        rename: (next) =>
          this.updateActivity(agentPath, activityId, { title: next }),
        warn: (message, detail) =>
          console.warn(`${message} for ${activityId}`, detail),
      });
    }
    async deleteActivity(agentPath: string, id: string): Promise<void> {
      if (this.ctx.cp)
        await viaSdk(
          `${controlPlane.agentPath(agentPath)}/activities/${encodeURIComponent(id)}`,
          () => this.ctx.sdk.activities.writes.delete(agentPath, id),
        );
      else activities.deleteActivity(agentPath, id);
      if (this.ctx.cp)
        void deleteCachedConversation(agentPath, missionConversationId(id));
      emitLocalEcho("ActivityChanged", { agentPath });
    }

    async listConversations(agentPath: string): Promise<ConversationEntry[]> {
      const agentName = agents.agentNameByPath(agentPath) ?? agentPath;
      const acts = await this.listActivities(agentPath);
      return acts.map((a) =>
        activities.activityToConversation(a, agentPath, agentName),
      );
    }
    async listAllConversations(
      agentPaths: string[],
      opts?: { signal?: AbortSignal },
    ): Promise<AllConversationsResult> {
      const settled = await this.ctx.sdk.fanOut.settle(
        agentPaths,
        (p) => this.listConversations(p),
        opts,
      );
      opts?.signal?.throwIfAborted();
      const conversations: ConversationEntry[] = [];
      const failedAgents: FailedAgentRead[] = [];
      settled.forEach((outcome, i) => {
        if (outcome.status === "fulfilled") {
          conversations.push(...outcome.value);
          return;
        }
        failedAgents.push({ agentPath: agentPaths[i], reason: outcome.reason });
        console.warn(
          `[activities] conversations read failed for ${agentPaths[i]}: ${String(
            outcome.reason,
          )}`,
        );
      });
      if (agentPaths.length > 0 && failedAgents.length === agentPaths.length)
        throw failedAgents[0].reason;
      return { conversations, failedAgents };
    }
  }
  return Activities;
}
