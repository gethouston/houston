import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripLegacySetupDirective } from "@houston/domain";
import { atomicTempPath } from "@houston/protocol";
import { agentRoots } from "./chat-history";

const CLAUDE_MD = "CLAUDE.md";

export interface SweepLegacySetupResult {
  sweptAgents: number;
  failedAgents: number;
}

function writeAtomic(path: string, content: string): void {
  const tmp = atomicTempPath(path, `${process.pid}-${randomUUID()}`);
  try {
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

export function sweepAgentLegacySetup(agentRoot: string): boolean {
  const path = join(agentRoot, CLAUDE_MD);
  let current: string;
  try {
    current = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  const stripped = stripLegacySetupDirective(current);
  if (stripped === current) return false;
  writeAtomic(path, stripped);
  return true;
}

export function sweepLegacySetupDirectives(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
  report?: (agentRoot: string, err: unknown) => void;
}): SweepLegacySetupResult {
  const log = opts.log ?? ((line: string) => console.log(line));
  const report =
    opts.report ??
    ((agentRoot: string, err: unknown) =>
      console.error(`[legacy-setup] ${agentRoot}: sweep failed:`, err));
  const result: SweepLegacySetupResult = { sweptAgents: 0, failedAgents: 0 };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    try {
      if (sweepAgentLegacySetup(agentRoot)) {
        result.sweptAgents++;
        log(`[legacy-setup] ${agentRoot}: removed the setup section`);
      }
    } catch (err) {
      result.failedAgents++;
      report(agentRoot, err);
    }
  }
  return result;
}
