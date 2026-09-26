import {
  FilesColumnBand,
  type SortDirection,
  type SortKey,
} from "@houston-ai/agent";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";
import { useAgentFiles } from "../../agent/agent-files";
import { PageHeaderTools } from "../../shell/page-header/page-header-tools";
import { TeamFilesList } from "./team-files-list";
import { TeamFilesToolbar } from "./team-files-toolbar";

export function TeamFiles({ agent }: { agent: Agent }) {
  const { t } = useTranslation("agents");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: SortDirection;
  }>({ key: "name", dir: "asc" });
  const [folderRequest, setFolderRequest] = useState(0);
  const files = useAgentFiles(agent);
  const requestNewFolder = () => setFolderRequest((current) => current + 1);
  const onSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
    }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeaderTools>
        {() => (
          <TeamFilesToolbar
            actions={{ ...files.actions, newFolder: requestNewFolder }}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </PageHeaderTools>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
        <FilesColumnBand
          labels={{
            columnName: t("files.columns.name"),
            columnDateModified: t("files.columns.dateModified"),
            columnSize: t("files.columns.size"),
          }}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={onSort}
        />
        <TeamFilesList
          agent={agent}
          files={files}
          query={query}
          sort={sort}
          createFolderRequest={folderRequest}
        />
      </div>
    </div>
  );
}
