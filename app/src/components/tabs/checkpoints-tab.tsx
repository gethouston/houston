/**
 * `CheckpointsTab` — built-in tab adapter for `<CheckpointsPanel />`.
 * Phase 5 of RFC #248 / `advanced.checkpoints`.
 */
import type { TabProps } from "../../lib/types";
import { CheckpointsPanel } from "../checkpoints/checkpoints-panel";

export default function CheckpointsTab({ agent }: TabProps) {
  return <CheckpointsPanel agentPath={agent.folderPath} />;
}
