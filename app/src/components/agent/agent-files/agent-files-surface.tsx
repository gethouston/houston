import { FilesBrowser } from "@houston-ai/agent";
import { agentReadFailures } from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import { AgentReadsFailed } from "../../agent-reads-failed";
import { useAgentFiles } from "./use-agent-files";

/**
 * ONE agent's files, rendered: the browser, its overlays, and the strip that
 * says so when the read failed.
 *
 * The team view's Files section (`team-view/team-files/`) mounts exactly this,
 * adding only the agent dropdown above it. It is a component rather than a
 * second copy of four lines because the failure strip is not decoration: an
 * empty tree and a broken tree look identical, and back when two surfaces
 * showed an agent's files only one of them carried the strip — they already
 * disagreed about whether a person gets told.
 *
 * Mount it with the agent's id as its KEY. Everything a person has half-done to
 * a tree — the open preview, a pending move conflict, a half-answered delete
 * confirm — belongs to the agent that owns it, and none of it should survive
 * into the next agent's tree. (The view mode is the deliberate exception: it
 * lives in the UI store, so it is shared.) Keying is also what lets a caller
 * with no agent at all render nothing: `useAgentFiles` needs one, and hooks may
 * not run conditionally.
 */
export function AgentFilesSurface({ agent }: { agent: Agent }) {
  const { browserProps, overlays, error, refetch, isFetching } =
    useAgentFiles(agent);

  return (
    <>
      {/* A failed read is stated, never swallowed. One agent, so `total` is 1
          and the strip uses its named copy. The gutter is
          `FILES_CONTENT_COLUMN`'s, so the strip's left edge lands on the
          listing's. */}
      <div className="px-6">
        <AgentReadsFailed
          failures={agentReadFailures([{ agent, error }])}
          onRetry={refetch}
          retrying={isFetching}
        />
      </div>
      <div className="min-h-0 flex-1">
        <FilesBrowser {...browserProps} />
      </div>
      {overlays}
    </>
  );
}
