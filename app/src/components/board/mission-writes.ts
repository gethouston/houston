import type { KanbanItem } from "@houston-ai/board";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { allCachedConversationRows } from "../../lib/cached-conversation-rows";
import {
  forgetConversationDraftsOf,
  forgetDeletedConversationDrafts,
} from "../../lib/conversation-drafts";
import i18n from "../../lib/i18n";
import {
  type MissionEdit,
  type MissionGroups,
  missionEditPatches,
  missionRemovalPatches,
} from "../../lib/mission-cache-patches";
import type { OptimisticFailureCopy } from "../../lib/optimistic-core";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";
import { boardItemConversationRow } from "./board-item-row";

export type MissionHome = "board" | "archive";

const ownList = (agentPath: string): QueryKey[] => [
  queryKeys.activity(agentPath),
];

const titleOf = (item: KanbanItem) => ({ title: item.title });

export function deleteMission(
  qc: QueryClient,
  agentPath: string,
  item: KanbanItem,
  home: MissionHome,
): Promise<void> {
  const row = boardItemConversationRow(item);
  return optimisticWrite({
    qc,
    command: "delete_mission",
    patches: missionRemovalPatches({ [agentPath]: [item.id] }),
    write: () => tauriActivity.delete(agentPath, item.id),
    invalidate: ownList(agentPath),
    failure: {
      title: i18n.t("board:writeFailed.delete", titleOf(item)),
      description: i18n.t(
        home === "archive"
          ? "board:writeFailed.backInArchive"
          : "board:writeFailed.backOnBoard",
      ),
    },
    onSuccess: () => forgetConversationDraftsOf(row),
  });
}

export function editMission(
  qc: QueryClient,
  agentPath: string,
  item: KanbanItem,
  edit: MissionEdit,
  opts: {
    command: string;
    failure: OptimisticFailureCopy;
    refresh?: QueryKey[];
  },
): Promise<void> {
  return optimisticWrite({
    qc,
    command: opts.command,
    patches: missionEditPatches(
      { [agentPath]: [item.id] },
      edit,
      new Date().toISOString(),
    ),
    write: () => tauriActivity.update(agentPath, item.id, edit),
    invalidate: opts.refresh ?? ownList(agentPath),
    failure: opts.failure,
  });
}

export function moveFailure(
  item: KanbanItem,
  kind: "move" | "archive",
): OptimisticFailureCopy {
  return {
    title: i18n.t(`board:writeFailed.${kind}`, titleOf(item)),
    description: i18n.t(
      kind === "archive"
        ? "board:writeFailed.backOnBoard"
        : "board:writeFailed.backWhereItWas",
    ),
  };
}

export function renameFailure(item: KanbanItem): OptimisticFailureCopy {
  return {
    title: i18n.t("board:writeFailed.rename", titleOf(item)),
    description: i18n.t("board:writeFailed.oldName"),
  };
}

function bulkRefresh(groups: MissionGroups, paths: string[]): QueryKey[] {
  return [
    queryKeys.allConversations(paths),
    ...Object.keys(groups).map((agentPath) => queryKeys.activity(agentPath)),
  ];
}

function perAgent(
  groups: MissionGroups,
  call: (agentPath: string, ids: string[]) => Promise<void>,
): () => Promise<void> {
  return async () => {
    await Promise.all(
      Object.entries(groups).map(([agentPath, ids]) =>
        call(agentPath, [...ids]),
      ),
    );
  };
}

export function deleteMissions(
  qc: QueryClient,
  groups: MissionGroups,
  paths: string[],
): Promise<void> {
  if (Object.keys(groups).length === 0) return Promise.resolve();
  const ids = Object.values(groups).flat();
  const rows = allCachedConversationRows(qc, paths);
  return optimisticWrite({
    qc,
    command: "bulk_delete_missions",
    patches: missionRemovalPatches(groups),
    write: perAgent(groups, tauriActivity.bulkDelete),
    invalidate: bulkRefresh(groups, paths),
    failure: {
      title: i18n.t("board:writeFailed.bulkDelete"),
      description: i18n.t("board:writeFailed.bulkBack"),
    },
    onSuccess: () => forgetDeletedConversationDrafts(ids, rows),
  });
}

export function editMissions(
  qc: QueryClient,
  groups: MissionGroups,
  paths: string[],
  status: string,
  kind: "move" | "archive",
): Promise<void> {
  if (Object.keys(groups).length === 0) return Promise.resolve();
  return optimisticWrite({
    qc,
    command:
      kind === "archive" ? "bulk_archive_missions" : "bulk_move_missions",
    patches: missionEditPatches(groups, { status }, new Date().toISOString()),
    write: perAgent(groups, (agentPath, ids) =>
      tauriActivity.bulkUpdate(agentPath, ids, { status }),
    ),
    invalidate: bulkRefresh(groups, paths),
    failure: {
      title: i18n.t(
        kind === "archive"
          ? "board:writeFailed.bulkArchive"
          : "board:writeFailed.bulkMove",
      ),
      description: i18n.t("board:writeFailed.bulkBack"),
    },
  });
}
