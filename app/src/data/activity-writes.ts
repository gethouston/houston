import { toCanonicalProviderId } from "@houston/sdk/provider-catalog";
import { serialQueue } from "../lib/serial-queue.ts";
import type { TurnMode } from "../lib/turn-mode.ts";
import type { Activity, ActivityUpdate } from "./activity";
import {
  applyActivityPatch,
  applyBulkPatch,
  applyBulkRemove,
  applyRemove,
} from "./activity-bulk.ts";

export interface ActivityFileIo {
  list: (agentPath: string) => Promise<Activity[]>;
  write: (agentPath: string, items: Activity[]) => Promise<void>;
  now: () => string;
  newId: () => string;
}

export function activityWrites(io: ActivityFileIo) {
  const queued = serialQueue();
  return {
    create: (
      agentPath: string,
      title: string,
      description: string,
      agent?: string,
      provider?: string,
      model?: string,
      mode?: TurnMode,
    ): Promise<Activity> =>
      queued(agentPath, async () => {
        const items = await io.list(agentPath);
        const item: Activity = {
          id: io.newId(),
          title,
          description,
          status: "running",
          claude_session_id: null,
          agent,
          updated_at: io.now(),
          provider:
            provider === undefined
              ? undefined
              : toCanonicalProviderId(provider),
          model,
          ...(mode ? { mode } : {}),
        };
        await io.write(agentPath, [...items, item]);
        return item;
      }),

    update: (
      agentPath: string,
      id: string,
      patch: ActivityUpdate,
    ): Promise<Activity> =>
      queued(agentPath, async () => {
        const items = await io.list(agentPath);
        const idx = items.findIndex((a) => a.id === id);
        const item = items[idx];
        if (!item) throw new Error(`Activity not found: ${id}`);
        const merged = applyActivityPatch(item, patch, io.now());
        const next = [...items];
        next[idx] = merged;
        await io.write(agentPath, next);
        return merged;
      }),

    remove: (agentPath: string, id: string): Promise<void> =>
      queued(agentPath, async () => {
        const items = await io.list(agentPath);
        const { items: next, removed } = applyRemove(items, id);
        if (!removed) return;
        await io.write(agentPath, next);
      }),

    bulkUpdate: (
      agentPath: string,
      ids: string[],
      patch: ActivityUpdate,
    ): Promise<void> =>
      queued(agentPath, async () => {
        const items = await io.list(agentPath);
        const next = applyBulkPatch(items, new Set(ids), patch, io.now());
        await io.write(agentPath, next);
      }),

    bulkRemove: (agentPath: string, ids: string[]): Promise<void> =>
      queued(agentPath, async () => {
        const items = await io.list(agentPath);
        await io.write(agentPath, applyBulkRemove(items, new Set(ids)));
      }),
  };
}
