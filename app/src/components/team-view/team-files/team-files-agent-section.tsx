import {
  FilesAgentRow,
  FilesBrowser,
  KEBAB_BUTTON_CLASS,
  type SortDirection,
  type SortKey,
} from "@houston-ai/agent";
import {
  agentNameToneClass,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { Download, EllipsisVertical, FolderOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { agentReadFailures } from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import { useAgentFiles } from "../../agent/agent-files";
import { AgentReadsFailed } from "../../agent-reads-failed";
import type { TeamFileActions } from "./team-files-toolbar";

export function TeamFilesAgentSection({
  agent,
  expanded,
  onToggle,
  query,
  sort,
  actions,
  createFolderRequest,
  onRequestNewFolder,
  onActionsReady,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
  query: string;
  sort: { key: SortKey; dir: SortDirection };
  actions: Map<string, TeamFileActions>;
  createFolderRequest: number;
  onRequestNewFolder: () => void;
  onActionsReady: () => void;
}) {
  const { t } = useTranslation("agents");
  // The query stays disabled until first expansion. Collapsed sections remain
  // mounted afterward so their cached tree and inline state do not reset.
  const files = useAgentFiles(agent, { enabled: expanded });
  actions.set(agent.id, {
    ...files.actions,
    newFolder: onRequestNewFolder,
  });
  useEffect(onActionsReady, [onActionsReady]);
  const rowActions = files.actions.reveal
    ? {
        label: t("files.openInFileManager"),
        run: files.actions.reveal,
      }
    : files.actions.downloadAll
      ? { label: t("files.downloadAll"), run: files.actions.downloadAll }
      : null;
  const count = useMemo(
    () =>
      files.entries?.reduce(
        (total, entry) => total + (entry.path.includes("/") ? 0 : 1),
        0,
      ),
    [files.entries],
  );

  return (
    <FilesBrowser
      {...files.browserProps}
      dragScope={agent.id}
      expanded={expanded}
      query={query}
      sortKey={sort.key}
      sortDir={sort.dir}
      depth={1}
      createFolderRequest={createFolderRequest}
      inFrame
      header={
        <FilesAgentRow
          name={agent.name}
          avatar={
            <HoustonAvatar
              color={resolveAgentColor(agent.color)}
              diameter={10}
            />
          }
          countLabel={
            count === undefined ? undefined : t("files.itemCount", { count })
          }
          expanded={expanded}
          onToggle={onToggle}
          folderClassName={agentNameToneClass(agent.color)}
          expandLabel={t("files.expandAgent", { name: agent.name })}
          collapseLabel={t("files.collapseAgent", { name: agent.name })}
          actions={
            rowActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("files.menuButton")}
                    onClick={(event) => event.stopPropagation()}
                    className={cn("size-auto", KEBAB_BUTTON_CLASS)}
                  >
                    <EllipsisVertical aria-hidden className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={rowActions.run}>
                    {files.actions.reveal ? (
                      <FolderOpen aria-hidden />
                    ) : (
                      <Download aria-hidden />
                    )}
                    {rowActions.label}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }
        />
      }
      notice={
        <AgentReadsFailed
          failures={agentReadFailures([{ agent, error: files.error }])}
          onRetry={files.refetch}
          retrying={files.isFetching}
        />
      }
      footer={files.overlays}
    />
  );
}
