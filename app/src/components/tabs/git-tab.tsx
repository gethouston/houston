/**
 * `GitTab` — built-in tab adapter that mounts `<GitPanel />` for the
 * current agent's folder path. The actual gating happens at the tab
 * INJECTION layer (workspace-shell.tsx) — by the time this renders the
 * `advanced.git_panel` flag is already on. The panel itself decides
 * whether the cwd is a real git repo and shows the appropriate state.
 *
 * Phase 3 of RFC #248.
 */
import type { TabProps } from "../../lib/types";
import { GitPanel } from "../git/git-panel";

export default function GitTab({ agent }: TabProps) {
  return <GitPanel cwd={agent.folderPath} />;
}
