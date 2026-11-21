import { agentFileEventType } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";

export function classifyChange(relPath: string): HoustonEvent | null {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[1] === ".shared") {
    return parts[2] === "skills" && parts.length > 3
      ? { type: "SharedSkillsChanged", workspaceId: parts[0] ?? "" }
      : null;
  }
  const agentPath = `${parts[0]}/${parts[1]}`;
  const rest = parts.slice(2).join("/");
  const type = agentFileEventType(rest);
  return type ? { type, agentPath } : null;
}
