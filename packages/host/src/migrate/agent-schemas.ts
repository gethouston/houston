import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { FAMILIES, schemaDoc } from "@houston/domain";
import { atomicTempPath } from "@houston/protocol";
import { agentRoots } from "./chat-history";

export interface ReseedSchemasResult {
  updatedAgents: number;
  updatedFiles: number;
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = atomicTempPath(
    join(dirname(path), `.${Date.now()}-${Math.random()}`),
  );
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

export function reseedAgentSchema(
  agentRoot: string,
  log: (line: string) => void,
): number {
  const rewritten: string[] = [];
  for (const family of FAMILIES) {
    const path = join(agentRoot, ".houston", family, `${family}.schema.json`);
    const want = schemaDoc(family);
    let current: string | null = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = null;
    }
    if (current === want) continue;
    writeAtomic(path, want);
    rewritten.push(family);
  }
  if (rewritten.length) {
    log(`[agent-schemas] ${agentRoot}: re-seeded ${rewritten.join(", ")}`);
  }
  return rewritten.length;
}

export function reseedAgentSchemas(opts: {
  workspacesRoot: string;
  log?: (line: string) => void;
}): ReseedSchemasResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const result: ReseedSchemasResult = { updatedAgents: 0, updatedFiles: 0 };
  for (const agentRoot of agentRoots(opts.workspacesRoot)) {
    try {
      if (!statSync(join(agentRoot, ".houston")).isDirectory()) continue;
    } catch {
      continue;
    }
    try {
      const updated = reseedAgentSchema(agentRoot, log);
      if (updated > 0) {
        result.updatedAgents++;
        result.updatedFiles += updated;
      }
    } catch (err) {
      log(`[agent-schemas] ${agentRoot}: re-seed failed (skipping): ${err}`);
    }
  }
  return result;
}
