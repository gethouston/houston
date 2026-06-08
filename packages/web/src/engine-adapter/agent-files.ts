import { emitEvent } from "./bus";

/**
 * localStorage-backed agent-file store.
 *
 * The new TS engine has no concept of per-agent `.houston/**` files, but the
 * desktop UI reads/writes typed JSON (config, activity, learnings) and CLAUDE.md
 * through `readAgentFile` / `writeAgentFile`. We persist each file under a
 * per-(agent, path) key so the board, per-agent provider/model config,
 * learnings, and instructions all work and survive reloads, exactly like the
 * real engine's files, just client-side.
 *
 * On write we emit the same `*Changed` event the desktop file-watcher would, so
 * surfaces that didn't originate the write (the conversation list, the file
 * tree) still react, matching the engine's AI-native reactivity contract.
 */
const PREFIX = "houston.web.agentfile:";

function storageKey(agentPath: string, relPath: string): string {
  return `${PREFIX}${agentPath}::${relPath}`;
}

export function readAgentFile(agentPath: string, relPath: string): string {
  try {
    return localStorage.getItem(storageKey(agentPath, relPath)) ?? "";
  } catch {
    return "";
  }
}

export function writeAgentFile(agentPath: string, relPath: string, content: string): void {
  try {
    localStorage.setItem(storageKey(agentPath, relPath), content);
  } catch {
    /* storage disabled / quota exceeded */
  }
  emitFileEvent(agentPath, relPath);
}

/** Map a written path to the same invalidation event the desktop watcher emits. */
function emitFileEvent(agentPath: string, relPath: string): void {
  const type = relPath.match(/\.houston\/([^/]+)\//)?.[1];
  switch (type) {
    case "activity":
      emitEvent("ActivityChanged", { agent_path: agentPath });
      return;
    case "config":
      emitEvent("ConfigChanged", { agent_path: agentPath });
      return;
    case "learnings":
      emitEvent("LearningsChanged", { agent_path: agentPath });
      return;
    case "skills":
      emitEvent("SkillsChanged", { agent_path: agentPath });
      return;
  }
  if (relPath === "CLAUDE.md") {
    emitEvent("ContextChanged", { agent_path: agentPath });
    return;
  }
  emitEvent("FilesChanged", { agent_path: agentPath });
}
