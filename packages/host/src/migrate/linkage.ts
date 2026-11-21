import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SESSIONS_REL = join(".houston", "sessions");

function idsFromTrackerFile(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function sessionGroupsForAgent(
  agentRoot: string,
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  const sessionsDir = join(agentRoot, SESSIONS_REL);
  if (!existsSync(sessionsDir)) return groups;

  for (const provider of readdirSync(sessionsDir)) {
    const providerDir = join(sessionsDir, provider);
    let entries: string[];
    try {
      entries = readdirSync(providerDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const ext = entry.endsWith(".sid")
        ? ".sid"
        : entry.endsWith(".history")
          ? ".history"
          : null;
      if (!ext) continue;
      const sessionKey = entry.slice(0, -ext.length);
      let set = groups.get(sessionKey);
      if (!set) {
        set = new Set<string>();
        groups.set(sessionKey, set);
      }
      for (const id of idsFromTrackerFile(join(providerDir, entry)))
        set.add(id);
    }
  }
  return groups;
}
