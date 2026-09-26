import {
  FilesBrowser,
  type SortDirection,
  type SortKey,
} from "@houston-ai/agent";
import { agentReadFailures } from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import type { AgentFiles } from "../../agent/agent-files";
import { AgentReadsFailed } from "../../agent-reads-failed";

/** The employee's one file tree, with its read failure above it. */
export function TeamFilesList({
  agent,
  files,
  query,
  sort,
  createFolderRequest,
}: {
  agent: Agent;
  files: AgentFiles;
  query: string;
  sort: { key: SortKey; dir: SortDirection };
  createFolderRequest: number;
}) {
  return (
    <FilesBrowser
      {...files.browserProps}
      dragScope={agent.id}
      query={query}
      sortKey={sort.key}
      sortDir={sort.dir}
      createFolderRequest={createFolderRequest}
      inFrame
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
