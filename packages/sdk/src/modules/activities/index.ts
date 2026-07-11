/**
 * The activities module — the SDK-canonical board/missions read/write surface,
 * one reactive scope per agent (`activities/<agentId>`), holding an
 * {@link ActivitiesViewModel}. It mirrors what the desktop builds mission cards
 * from (`app/src/components/use-mission-control.ts`).
 *
 * Reads: `refresh(agentId)` publishes the agent's `activities/<agentId>`
 * snapshot, republished whole on every change. Writes (`create`, `setStatus`,
 * `rename`, `delete`) mutate then refetch, so the snapshot always reflects the
 * host. The same handlers back both the typed facade and the bridge `dispatch`
 * path, so there is one implementation each.
 *
 * Reactivity: a `/v1/events` subscription refetches on every (re)connect and on
 * each `ActivityChanged` frame for an agent we've loaded. 401s route through the
 * shared {@link ModuleContext.authExpiry} notifier.
 */

import type { PendingInteraction } from "@houston/protocol";
import type { ModuleContext } from "../../module-context";
import { registerActivitiesCommands } from "./commands";
import { startActivitiesEventStream } from "./events-stream";
import { createActivitiesHttp } from "./http";
import {
  type ActivitiesModule,
  type ActivitiesViewModel,
  activitiesScope,
  type CreatedActivity,
  matchesActivitySessionKey,
  sessionKeyOf,
  toActivityItem,
} from "./types";

export { ActivitiesHttpError } from "./http";
export type {
  ActivitiesModule,
  ActivitiesViewModel,
  ActivityItem,
  CreatedActivity,
} from "./types";
export {
  ACTIVITY_CHANGED_EVENT,
  ACTIVITY_STATUSES,
  ActivitiesCommand,
  type ActivitiesCommandType,
  activitiesScope,
} from "./types";

export function createActivitiesModule(ctx: ModuleContext): ActivitiesModule {
  const { store, authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;
  const emitTokenExpired = () => authExpiry.notifyExpired();
  const http = createActivitiesHttp(baseUrl, ports, emitTokenExpired);

  /** Agents we've loaded at least once — the set the reactivity stream refetches. */
  const known = new Set<string>();
  // Monotonic per-agent request sequence, so a slow refetch that resolves after
  // a newer one never flushes stale rows over the fresh snapshot (last-intent
  // wins). Mirrors the conversations module's guard.
  const loadSeq = new Map<string, number>();

  // `silent` skips the intermediate `loaded:false` republish. An explicit
  // (user) refresh signals loading so a surface can show a spinner; a
  // background catch-up refetch (connect/event-driven) is silent — it must not
  // flash the list to "loading" on every reactivity tick (and it keeps the
  // already-loaded snapshot stable for a synchronous reader).
  async function refresh(agentId: string, silent = false): Promise<void> {
    known.add(agentId);
    const scope = activitiesScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    if (!silent) {
      // Signal loading while keeping any prior items to avoid a flush-to-empty.
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
  // Board persist for the turn machinery (SDK path), keyed by chat session, not
  // id (contract on {@link ActivitiesModule}). The interaction the turn ended on
  // rides the same PATCH (`null` clears it — turn start, or a settle carrying
  // none), so a `needs_you` card survives reload on the SDK path exactly as the
  // web adapter persists it. Refetch is SILENT — a mid-turn write must not flash
  // the board to "loading".
  async function setStatusBySessionKey(
    agentId: string,
    sessionKey: string,
    status: string,
    pendingInteraction: PendingInteraction | null,
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
    await http.update(agentId, match.id, {
      status,
      pending_interaction: pendingInteraction,
    });
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

  // A stream-driven refetch is not a user action: a transient failure just
  // leaves the snapshot stale until the next event. A 401 still surfaces (http
  // fires emitTokenExpired), so only the noise is logged, never swallowed.
  const backgroundRefresh = (agentId: string, where: string) =>
    void refresh(agentId, true).catch((err) =>
      ports.logger.debug(`activities refresh (${where}) failed`, {
        error: String(err),
        agentId,
      }),
    );

  // Reactivity off (`config.reactivity === false`): the host owns its own read
  // model + invalidation (the web adapter), so we DON'T open a duplicate
  // `/v1/events` stream — the module stays write-only and `dispose` is a no-op.
  const dispose =
    ctx.config.reactivity === false
      ? () => {}
      : startActivitiesEventStream({
          baseUrl,
          fetch: ports.fetch,
          clock: ports.clock,
          logger: ports.logger,
          handlers: {
            onConnect: () => {
              for (const id of known) backgroundRefresh(id, "connect");
            },
            onActivityChanged: (agentPath) => {
              // Targeted: only an agent we're showing. A frame with no agentPath
              // can't be targeted, so refetch every known agent (catch-up,
              // never a miss).
              if (agentPath === undefined) {
                for (const id of known) backgroundRefresh(id, "change");
              } else if (known.has(agentPath)) {
                backgroundRefresh(agentPath, "change");
              }
            },
            onUnauthorized: emitTokenExpired,
          },
        });

  return {
    scope: activitiesScope,
    refresh,
    create,
    setStatus,
    setStatusBySessionKey,
    rename,
    delete: del,
    dispose,
  };
}
