import type { AgentInitialConfig } from "@houston/engine-adapter";
import type { Agent } from "../../lib/types";

export interface CreatedAgent {
  agent: Agent;
}

export interface AgentState {
  agents: Agent[];
  current: Agent | null;
  loading: boolean;
  /**
   * True once `loadAgents` has settled at least once. `loading` alone can't
   * distinguish "not started yet" from "loaded, empty": boot has an async gap
   * between workspaces resolving and the first `loadAgents` call, and the v3
   * first-run gate (zero agents, HOU-653) must not read `agents: []` in that
   * gap as a fresh install.
   */
  loaded: boolean;
  /** Workspace whose roster last settled, including a failed read. */
  loadedWorkspaceId: string | null;
  loadAgents: (
    workspaceId: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  /**
   * Settle with no agents, for a boot that resolved NO workspace to list them
   * for — the workspace load failed (already toasted + reported by `call()`,
   * and recorded as `loadError` for the Settings retry) or the account has
   * none. `loadAgents` is never called in that path, so without this `loaded`
   * stays false forever and every gate reading it hangs: the boot splash never
   * lifts and the provider probe never runs (HOU-979). Settled-empty is the
   * honest state — there is no space, so there are no agents.
   */
  settleEmpty: () => void;
  setCurrent: (agent: Agent) => void;
  /**
   * Reveal a freshly created agent: mark it provisioning (HOU-693), append it
   * to the sidebar optimistically, and select it. The tail of `create`, also
   * used by flows that create through another pipeline (agent import,
   * HOU-710) so every creation gets the same optimistic contract.
   */
  adopt: (agent: Agent) => void;
  create: (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
    /** The config the agent is born with: a new hire's pin and first day. */
    config?: AgentInitialConfig,
  ) => Promise<CreatedAgent>;
  delete: (workspaceId: string, id: string) => Promise<void>;
  rename: (workspaceId: string, id: string, newName: string) => Promise<Agent>;
  updateColor: (
    workspaceId: string,
    id: string,
    color: string,
  ) => Promise<void>;
  /** Drop the agent list back to its initial (unloaded) state on an identity
   *  change (HOU-903); the incoming account re-loads its own agents on boot. */
  reset: () => void;
}
