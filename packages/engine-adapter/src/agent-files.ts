import { emitEvent } from "./bus";

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

export function writeAgentFile(
  agentPath: string,
  relPath: string,
  content: string,
): void {
  try {
    localStorage.setItem(storageKey(agentPath, relPath), content);
  } catch {}
  emitFileEvent(agentPath, relPath);
}

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
