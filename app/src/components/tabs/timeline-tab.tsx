/**
 * `TimelineTab` — built-in tab adapter for `<TimelinePanel />`. Phase 4
 * of RFC #248 / `advanced.timeline`. Tab injection happens in
 * workspace-shell.tsx behind the flag.
 */
import type { TabProps } from "../../lib/types";
import { TimelinePanel } from "../timeline/timeline-panel";

export default function TimelineTab({ agent }: TabProps) {
  return <TimelinePanel agentPath={agent.folderPath} />;
}
