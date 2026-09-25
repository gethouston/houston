import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripLegacySetupDirective } from "@houston/domain";
import { atomicTempPath } from "@houston/protocol";
import { agentRoots } from "./chat-history";

/**
 * Remove the retired onboarding's setup section (its "send ONE real email
 * now" directive, see packages/domain/src/legacy-setup-directive.ts) from
 * every AI Employee's CLAUDE.md under the tree this host serves.
 *
 * It runs at host boot, where the files are local: on the desktop host and on
 * a managed pod after hydration, so the store sync uploads the cleaned file
 * and no client ever has to wake a pod to clean it. Idempotent: only a file
 * that carries the section is rewritten, so a steady-state boot writes
 * nothing.
 */

const CLAUDE_MD = "CLAUDE.md";

export interface SweepLegacySetupResult {
  /** Agents whose CLAUDE.md lost a setup section this run. */
  sweptAgents: number;
  /** Agents whose CLAUDE.md could not be read or rewritten. */
  failedAgents: number;
}

/** Write via a unique tmp + rename so a crash never leaves a torn file. */
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

/**
 * Strip one agent's CLAUDE.md, returning whether it changed. An agent with no
 * CLAUDE.md has nothing to strip; any other read or write failure throws.
 */
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

/**
 * Sweep every agent under the workspaces tree. One agent's failure is
 * reported and the sweep goes on: an unreadable file must never stop the host
 * from booting (the same posture as the sibling boot migrations).
 */
export function sweepLegacySetupDirectives(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
  report?: (agentRoot: string, err: unknown) => void;
}): SweepLegacySetupResult {
  const log = opts.log ?? ((line: string) => console.log(line));
  const report =
    opts.report ??
    ((agentRoot: string, err: unknown) =>
      // Boot path with no UI thread to toast on: the sanctioned
      // console.error boundary, so it lands in the host log.
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
