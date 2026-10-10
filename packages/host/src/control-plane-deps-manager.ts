import type { AssistantDeps } from "./routes/assistant";
import type { AssistantSandboxDeps } from "./routes/assistant-sandbox-deps";
import type { HeartbeatRouteDeps } from "./routes/heartbeat";

/**
 * The part of `ControlPlaneDeps` (control-plane-deps.ts) that serves the person's AI Manager:
 * its home, where it performs Houston operations, what it cannot perform
 * here, and its daily morning briefing.
 */
export interface ManagerDeps {
  /**
   * Materialize a synthetic (dot-named) agent's directory — the personal
   * assistant's home (routes/assistant.ts). Local filesystem profiles only;
   * absent → `GET /v1/assistant` answers 503 instead of handing out an address
   * that resolves to nothing.
   */
  ensureSyntheticAgentDir?: AssistantDeps["ensureSyntheticAgentDir"];
  /**
   * The AI Manager's morning-briefing runner (heartbeat/runner.ts), behind
   * `POST /v1/heartbeat/run`. Wired by the local / self-host profile only;
   * absent → that route answers 501.
   */
  heartbeat?: HeartbeatRouteDeps["heartbeat"];
  /**
   * Where this deployment performs user-facing Houston operations, from the
   * one resolver (`routes/assistant-wiring.ts`): the gateway on a fronted pod,
   * this host itself when nothing fronts it. Absent → the runtime-facing
   * dispatcher falls back to reading the configured env pair alone.
   */
  assistantGateway?: AssistantSandboxDeps["assistantGateway"];
  /**
   * Operations this deployment cannot perform, from the same boot-time
   * resolution (`local/host-base.ts`). Absent → nothing is withheld, which is
   * the right answer behind a gateway that serves the whole surface.
   */
  unservedOperations?: AssistantSandboxDeps["unservedOperations"];
}
