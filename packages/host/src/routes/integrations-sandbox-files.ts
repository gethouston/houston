import type { Agent, AgentId, Workspace } from "../domain/types";
import { createFileStager } from "../integrations/file-staging";
import type { ActingContext } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import { agentFileReader } from "../integrations/workspace-file";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import { DEFAULT_PATHS } from "./agent-authz";
import { providerForAction } from "./integrations-fanout";

/** One stager per process, so its action-schema cache is shared. */
const stageFiles = createFileStager();

export interface SandboxFileDeps {
  store: WorkspaceStore;
  paths?: WorkspacePaths;
  /** The agent's folder on disk; absent where the host is not beside the
   *  files, which then executes file arguments as the agent passed them. */
  agentDir?: (ws: Workspace, agent: Agent) => string;
}

/**
 * The execute's params with every file argument uploaded from the calling
 * agent's folder (integrations/file-staging.ts). Untouched when the host is
 * not beside the agent's files or the owning provider cannot stage files.
 */
export async function stageSandboxFiles(
  deps: SandboxFileDeps,
  input: {
    registry: IntegrationRegistry;
    workspace: Workspace;
    agentId: AgentId;
    userId: string;
    action: string;
    params: Record<string, unknown>;
    acting?: ActingContext;
    provider?: Parameters<IntegrationRegistry["get"]>[0];
  },
): Promise<Record<string, unknown>> {
  const { agentDir } = deps;
  const provider = input.registry.get(
    input.provider ?? providerForAction(input.registry, input.action),
  );
  if (!agentDir || !provider.describeAction) return input.params;
  const paths = deps.paths ?? DEFAULT_PATHS;
  let read: ReturnType<typeof agentFileReader> | undefined;
  return stageFiles({
    provider,
    userId: input.userId,
    action: input.action,
    params: input.params,
    acting: input.acting,
    // The agent is looked up only once a file argument actually needs reading.
    readFile: async (path) => {
      if (!read) {
        const agent = await deps.store.getAgent(input.agentId);
        if (!agent) throw new Error(`agent ${input.agentId} not found`);
        read = agentFileReader({
          dir: agentDir(input.workspace, agent),
          rootKey: paths.agentRoot(input.workspace, agent),
        });
      }
      return read(path);
    },
  });
}
