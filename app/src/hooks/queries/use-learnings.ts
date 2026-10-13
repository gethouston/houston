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
import {
  type LearningSourceRow,
  memoryRows,
} from "../../lib/learning-provenance";
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
  // Adapt to the legacy `{ index, text }[]` shape so existing UIs keep working,
  // carrying the provenance fields through: the Memory rows show who taught a
  // learning and which mission it came from, and dropping them here (as this
  // adapter used to) makes that invisible no matter what the file says.
  // Archived memories (superseded by a consolidation) stay in the file for the
  // agent's recall but are history, not memory: the list shows active ones.
  const entries: LearningSourceRow[] = memoryRows(q.data ?? []);
  return { data: { entries }, isLoading: q.isLoading };
}

/**
 * The Memory tab's three writes, optimistic: the row appears, changes or
 * leaves the instant the user commits, and a refused write puts the list back
 * with an authored toast (`optimisticWrite`), unless `call()` already
 * showed copy of its own for it (offline, waking).
 *
 * Each resolves `true` once the file has the change and `false` when it was
 * refused, and never rejects: the card that sent it reopens with the typed
 * text on `false`, so a refusal never costs the user what they wrote.
 */
export function useLearningWrites(agentPath: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation("agents");
  const { data: session } = useSession();
  const { capabilities } = useCapabilities();
  // WHO is adding this learning by hand. Multiplayer only: in single player the
  // answer is always "the one user", so stamping it would add an identity key
  // to every desktop learnings.json for no reader.
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
