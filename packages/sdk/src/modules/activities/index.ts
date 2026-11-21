import type { ActivityStamp, PendingInteraction } from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import { registerActivitiesCommands } from "./commands";
import { attachActivitiesReactivity } from "./events-stream";
import { createActivitiesHttp, createActivitiesWrites } from "./http";
import {
  type ActivitiesModule,
  type ActivitiesViewModel,
  activitiesScope,
  type CreatedActivity,
} from "./types";
import {
  matchesActivitySessionKey,
  sessionKeyOf,
  toActivityItem,
} from "./view-model";

export { ActivitiesHttpError } from "./http";
export {
  ACTIVITY_CHANGED_EVENT,
  ACTIVITY_STATUSES,
  ActivitiesCommand,
  type ActivitiesCommandType,
  type ActivitiesModule,
  type ActivitiesViewModel,
  type ActivitiesWrites,
  type ActivityItem,
  activitiesScope,
  type CreateActivityOptions,
  type CreatedActivity,
} from "./types";

export function createActivitiesModule(ctx: ModuleContext): ActivitiesModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;
  const emitTokenExpired = () => authExpiry.notifyExpired();
  const http = createActivitiesHttp(ctx);

  const known = new Set<string>();
  const loadSeq = new Map<string, number>();

  async function refresh(agentId: string, silent = false): Promise<void> {
    known.add(agentId);
    const scope = activitiesScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    if (!silent) {
      const prior = store.getSnapshot(scope) as ActivitiesViewModel | undefined;
      store.publish(scope, { loaded: false, items: prior?.items ?? [] });
    }
    const items = await http.list(agentId);
    if (loadSeq.get(agentId) === seq)
      store.publish(scope, {
        loaded: true,
        items: items.map(toActivityItem),
      } satisfies ActivitiesViewModel);
  }

  async function create(
    agentId: string,
    title: string,
    description?: string,
  ): Promise<CreatedActivity> {
    const activity = await http.create(agentId, {
      title,
      ...(description !== undefined ? { description } : {}),
    });
    await refresh(agentId);
    return { id: activity.id, sessionKey: sessionKeyOf(activity) };
  }

  async function setStatus(
    agentId: string,
    id: string,
    status: string,
  ): Promise<void> {
    await http.update(agentId, id, { status });
    await refresh(agentId);
  }
  async function setStatusBySessionKey(
    agentId: string,
    sessionKey: string,
    status: string,
    pendingInteraction: PendingInteraction | null,
    stamp?: ActivityStamp,
  ): Promise<void> {
    const match = (await http.list(agentId)).find((a) =>
      matchesActivitySessionKey(a, sessionKey),
    );
    if (!match) {
      ports.logger.warn("activities: no activity for session key", {
        agentId,
        sessionKey,
        status,
      });
      return;
    }
    await http.update(
      agentId,
      match.id,
      {
        status,
        pending_interaction: pendingInteraction,
      },
      stamp,
    );
    await refresh(agentId, true);
  }
  async function rename(
    agentId: string,
    id: string,
    title: string,
  ): Promise<void> {
    await http.update(agentId, id, { title });
    await refresh(agentId);
  }
  async function del(agentId: string, id: string): Promise<void> {
    await http.remove(agentId, id);
    await refresh(agentId);
  }

  registerActivitiesCommands(ctx, { refresh, create, setStatus, rename, del });

  const dispose =
    ctx.config.reactivity === false
      ? () => {}
      : attachActivitiesReactivity({
          baseUrl,
          fetch: ports.fetch,
          clock: ports.clock,
          logger: ports.logger,
          known,
          refresh: (agentId) => refresh(agentId, true),
          onUnauthorized: emitTokenExpired,
        });

  return {
    scope: activitiesScope,
    refresh,
    list: (agentId) => http.list(agentId),
    create,
    setStatus,
    setStatusBySessionKey,
    rename,
    delete: del,
    writes: createActivitiesWrites(http),
    dispose,
  };
}
