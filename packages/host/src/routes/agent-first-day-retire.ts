import { loadConfig, saveConfig, type TextStore } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import { withConfigLock } from "./agent-config-write";

interface FirstDayRecord {
  vfs: TextStore;
  root: string;
  agentId: string;
  emit?: (event: HoustonEvent) => void;
}

type StartKind = "setup" | "ordinary";

async function writeStarted(
  deps: FirstDayRecord,
  kind: StartKind,
): Promise<void> {
  const changed = await withConfigLock(deps.root, async () => {
    const { config } = await loadConfig(deps.vfs, deps.root);
    if (kind === "ordinary" && config.firstDay !== "pending") return false;
    await saveConfig(deps.vfs, deps.root, { ...config, firstDay: "started" });
    return true;
  });
  if (changed) deps.emit?.({ type: "ConfigChanged", agentPath: deps.agentId });
}

export function recordFirstDayStarted(deps: FirstDayRecord): Promise<void> {
  return writeStarted(deps, "setup");
}

export async function retirePendingFirstDay(
  deps: FirstDayRecord,
): Promise<void> {
  try {
    await writeStarted(deps, "ordinary");
  } catch (err) {
    console.error(
      `[first-day] retiring pending start failed for ${deps.agentId}:`,
      err,
    );
  }
}
