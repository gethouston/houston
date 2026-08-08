import type { TabProps } from "../../lib/types";
import { AgentFilesSurface } from "./agent-files";

/**
 * The per-agent Files tab: this agent's tree, filling the tab pane.
 *
 * Everything inside comes from `AgentFilesSurface` (`./agent-files/`) — the
 * browser, every callback and capability gate behind it, the overlays, and the
 * strip that says so when the read failed — which the team view's Files section
 * mounts too, so the two surfaces cannot drift. This file is deliberately
 * nothing but the tab's frame.
 */
export default function FilesTab({ agent }: TabProps) {
  return (
    <div className="flex h-full flex-col">
      <AgentFilesSurface key={agent.id} agent={agent} />
    </div>
  );
}
