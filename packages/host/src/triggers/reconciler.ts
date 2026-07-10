import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import { type ConvergeDeps, reconcileAgentTriggers } from "./converge";

export interface TriggerReconcilerDeps extends ConvergeDeps {
  store: WorkspaceStore;
  paths: WorkspacePaths;
  /** Sweep cadence. Default 60s. */
  intervalMs?: number;
}

/**
 * The self-host trigger reconciler: a periodic sweep that converges every
 * agent's trigger routines to their Composio instances (create / recreate on
 * config change / disable / delete). It sits beside the Scheduler and, like it,
 * is injectable (interval) and self-unref'ing so it never keeps the process
 * alive. Managed cloud does NOT run this — the Go control plane owns cloud
 * reconciliation; the host builds it only for a direct-key deployment with a
 * public webhook URL (see local/host.ts).
 *
 * Reentrancy-guarded: a slow sweep (Composio calls are network-bound) is never
 * overlapped by the next tick. A provider fault for one agent is logged through
 * the sanctioned background-loop console.error boundary and never stalls the rest.
 */
export class TriggerReconciler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly intervalMs: number;

  constructor(private readonly deps: TriggerReconcilerDeps) {
    this.intervalMs = deps.intervalMs ?? 60_000;
  }

  start(): void {
    if (this.timer) return;
    // Kick once at boot so provisioning happens now, not after the first interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** One sweep of every agent. Exposed for tests. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const ws of await this.deps.store.listWorkspaces()) {
        for (const agent of await this.deps.store.listAgents(ws.id)) {
          const root = this.deps.paths.agentRoot(ws, agent);
          try {
            await reconcileAgentTriggers(this.deps, agent.id, root);
          } catch (err) {
            // No UI thread at sweep time; log loudly and keep going.
            console.error(
              `[triggers] reconcile failed for ${agent.id} (continuing):`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
