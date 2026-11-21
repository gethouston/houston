import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Learning } from "../../data/learnings";
import * as learnings from "../../data/learnings";
import {
  appendLearning,
  dropLearning,
  editLearning,
  newLearning,
} from "../../lib/learning-optimistic";
import type { LearningSourceRow } from "../../lib/learning-provenance";
import { optimisticWrite } from "../../lib/optimistic-write";
import { isMultiplayer } from "../../lib/org-roles";
import { queryKeys } from "../../lib/query-keys";
import { useCapabilities } from "../use-capabilities";
import { useSession } from "../use-session";

export function useLearnings(agentPath: string | undefined) {
  const q = useQuery({
    queryKey: queryKeys.learnings(agentPath ?? ""),
    queryFn: () => learnings.list(agentPath ?? ""),
    enabled: !!agentPath,
    staleTime: 30_000,
  });
  const entries: LearningSourceRow[] = (q.data ?? []).map((l, index) => ({
    index,
    text: l.text,
    id: l.id,
    ...(l.taught_by ? { taughtBy: l.taught_by } : {}),
    ...(l.mission_id ? { missionId: l.mission_id } : {}),
    ...(l.mission_title ? { missionTitle: l.mission_title } : {}),
  }));
  return { data: { entries }, isLoading: q.isLoading };
}

export function useLearningWrites(agentPath: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation("agents");
  const { data: session } = useSession();
  const { capabilities } = useCapabilities();
  const taughtBy =
    isMultiplayer(capabilities) && session
      ? {
          user_id: session.uid,
          ...(session.displayName ? { name: session.displayName } : {}),
        }
      : undefined;

  const write = (
    command: string,
    apply: (list: Learning[] | undefined) => Learning[] | undefined,
    run: (path: string) => Promise<void>,
    failure: "add" | "update" | "remove",
  ): Promise<boolean> => {
    if (!agentPath) return Promise.resolve(false);
    let landed = false;
    return optimisticWrite({
      qc,
      command,
      patches: [{ queryKey: queryKeys.learnings(agentPath), apply }],
      write: () => run(agentPath),
      failure: {
        title: t(`learnings.failure.${failure}Title`),
        description: t(`learnings.failure.${failure}Body`),
      },
      onSuccess: () => {
        landed = true;
      },
    }).then(() => landed);
  };

  return {
    add: (text: string) => {
      const learning = newLearning(
        text,
        taughtBy,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      return write(
        "add_learning",
        (list) => appendLearning(list, learning),
        (path) => learnings.add(path, learning),
        "add",
      );
    },
    update: (id: string, text: string) =>
      write(
        "update_learning",
        (list) => editLearning(list, id, text),
        (path) => learnings.update(path, id, text),
        "update",
      ),
    remove: (id: string) =>
      write(
        "remove_learning",
        (list) => dropLearning(list, id),
        (path) => learnings.remove(path, id),
        "remove",
      ),
  };
}
