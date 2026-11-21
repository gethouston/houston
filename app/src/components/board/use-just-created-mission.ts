import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useState } from "react";
import {
  type CreatedMission,
  readCreatedMission,
  subscribeCreatedMission,
} from "../../lib/created-mission-handoff";

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

  const fallbackFor = useCallback(
    (selectedId: string | null): CreatedMission | null =>
      created && created.activityId === selectedId ? created : null,
    [created],
  );

  return { remember: setCreated, fallbackFor };
}
