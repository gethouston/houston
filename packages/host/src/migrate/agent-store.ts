import { relative, sep } from "node:path";
import { FAMILIES } from "@houston/domain";
import type { Agent, WorkspaceId } from "../domain/types";
import { LocalPaths } from "../paths";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs } from "../vfs";
import {
  FLAT_FAMILIES,
  LEGACY_LEARNINGS_MD,
  LEGACY_PROMPT_FILES,
  migrateAgentLayout,
} from "./agent-layout";
import { reseedAgentSchema } from "./agent-schemas";
import { sweepGatewayGroupNotes } from "./gateway-group-notes";
import { sweepAgentLegacySetup } from "./legacy-setup-directive";
import { backfillAgentRoutineCreatedBy } from "./routine-created-by";
import { migrateSidebarLayout } from "./sidebar-layout";

export const AGENT_STORE_MIGRATION_VERSION = 1;

export const AGENT_STORE_MIGRATIONS = [
  "agent-layout",
  "agent-schemas",
  "gateway-group-notes",
  "legacy-setup-directive",
  "routine-created-by",
  "sidebar-layout",
] as const;

export const HOST_ONLY_MIGRATIONS: Record<string, string> = {
  "chat-history":
    "imports the Rust-era desktop SQLite db, which no managed store holds",
};

export const AGENT_STORE_MIGRATION_PATHS: ReadonlySet<string> = new Set([
  "CLAUDE.md",
  "GROUP.md",
  ...FLAT_FAMILIES.map((family) => `.houston/${family}.json`),
  ...FAMILIES.flatMap((family) => [
    `.houston/${family}/${family}.json`,
    `.houston/${family}/${family}.schema.json`,
  ]),
  LEGACY_LEARNINGS_MD,
  ...LEGACY_PROMPT_FILES,
]);

export interface AgentStoreMigrationReport {
  layoutFiles: number;
  schemaFiles: number;
  setupSections: number;
  routinesStamped: number;
}

export async function migrateAgentStore(opts: {
  workspacesRoot: string;
  agentRoot: string;
  ownerSub?: string;
  log: (message: string, error?: unknown) => void;
}): Promise<AgentStoreMigrationReport> {
  const { workspacesRoot, agentRoot, log } = opts;
  const store = new OneAgentStore(
    workspacesRoot,
    relative(workspacesRoot, agentRoot).split(sep).join("/"),
  );
  const vfs = new FsVfs(workspacesRoot);
  const paths = new LocalPaths();
  await migrateSidebarLayout({ store, vfs, paths, log });
  await sweepGatewayGroupNotes({ enginePod: true, store, vfs, paths, log });
  const lines = (line: string) => log(line);
  const report: AgentStoreMigrationReport = {
    layoutFiles: migrateAgentLayout(agentRoot, lines),
    schemaFiles: reseedAgentSchema(agentRoot, lines),
    setupSections: sweepAgentLegacySetup(agentRoot) ? 1 : 0,
    routinesStamped: 0,
  };
  if (opts.ownerSub) {
    try {
      report.routinesStamped = backfillAgentRoutineCreatedBy(
        agentRoot,
        opts.ownerSub,
      );
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      log(`[routine-created-by] ${agentRoot}: routines doc is not JSON`);
    }
  }
  return report;
}

class OneAgentStore extends LocalWorkspaceStore {
  constructor(
    root: string,
    private readonly agentId: string,
  ) {
    super(root);
  }

  override async listAgents(workspaceId: WorkspaceId): Promise<Agent[]> {
    const agents = await super.listAgents(workspaceId);
    return agents.filter((agent) => agent.id === this.agentId);
  }

  override async listAllAgents(): Promise<Agent[]> {
    const agents = await super.listAllAgents();
    return agents.filter((agent) => agent.id === this.agentId);
  }
}
