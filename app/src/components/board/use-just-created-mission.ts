import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useState } from "react";
import {
  type CreatedMission,
  readCreatedMission,
  subscribeCreatedMission,
} from "../../lib/created-mission-handoff";

/**
 * The mission just CREATED, until the cross-agent sweep returns it.
 *
 * The create hands back an id and the board selects it on the spot, but the
 * sweep is a beat behind — and against a cold agent, seconds behind. With no
 * row to read, the open panel loses its session key and its agent path, and the
 * user's first message disappears from under them. The per-agent board carried
 * this fallback built in (its `sessionKeyFor` derived `activity-<id>` for an
 * unknown id); that board is gone, so it lives here.
 *
 * Two creates reach it. The board's own composer calls `remember` directly. A
 * mission created OUTSIDE the board — the agent's self-setup mission, fired by
 * the create dialog — publishes to `lib/created-mission-handoff.ts` before it
 * opens the panel, and this hook adopts it: on the publish if the board is
 * already mounted, else on the mount that follows it. Every kept-alive board
 * adopts the same offer (see that module on why it is not one-shot); only the
 * one whose selection IS that mission ever reads the fallback back out.
 *
 * The fallback is dropped the moment the real row lands: from then on the row
 * is the truth, because it carries the status the turn stream writes.
 */
export function useJustCreatedMission(items: KanbanItem[]) {
  const [created, setCreated] = useState<CreatedMission | null>(null);

  useEffect(() => {
    const adopt = () => {
      const published = readCreatedMission();
      if (published) setCreated(published);
    };
    adopt();
    return subscribeCreatedMission(adopt);
  }, []);

  useEffect(() => {
    if (created && items.some((i) => i.id === created.activityId)) {
      setCreated(null);
    }
  }, [created, items]);

  /** The fallback for `selectedId`, or null when the row is (or was) real. */
  const fallbackFor = useCallback(
    (selectedId: string | null): CreatedMission | null =>
      created && created.activityId === selectedId ? created : null,
    [created],
  );

  return { remember: setCreated, fallbackFor };
}
