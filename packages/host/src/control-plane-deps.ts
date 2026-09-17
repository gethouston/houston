import type { Capabilities } from "@houston/protocol";
import type { MountAdmin } from "./admin-seam";
import type { SharedEndpointStore } from "./credentials/remote-shared-endpoint-store";
import type { ViewFamily } from "./docs/view-capture";
import type { Agent, Workspace, WorkspaceRuntime } from "./domain/types";
import type { EventHub } from "./events/hub";
import type { FeedbackSender } from "./feedback";
import type { WorkspacePaths } from "./paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  TokenVerifier,
  WorkspaceStore,
} from "./ports";
import type { AgentConfigsDeps } from "./routes/agent-configs";
import type { AssistantDeps } from "./routes/assistant";
import type { AssistantSandboxDeps } from "./routes/assistant-sandbox-deps";
import type { CredentialServeHealer } from "./routes/credential-healer";
import type { CustomIntegrationDeps } from "./routes/custom-integrations";
import type { IntegrationDeps } from "./routes/integrations";
import type { FireLock } from "./schedule/fire-lock";
import type { TranscriptShadow } from "./transcripts/http-shadow";
import type { TriggerEventLock } from "./triggers/fire";
import type { Vfs } from "./vfs";

/**
 * Everything one deployment profile hands the host server: the ports it can
 * reach, and the posture it runs under. A profile (desktop, self-host, managed
 * pod) differs from another ONLY in what it sets here — an absent dependency is
 * a documented, named refusal on the routes that need it, never a crash.
 */
export interface ControlPlaneDeps {
  verifier: TokenVerifier;
  /** Authenticated agent-scoped request seen for this agent id (docs/projector binding). */
  addressedAgent?: (agentId: string) => void;
  /**
   * Receives every successful view-route response body (docs/view-capture)
   * for publication to the managed doc store. Cloud pods only; absent on
   * desktop/self-host.
   */
  viewSink?: (agentId: string, family: ViewFamily, body: unknown) => void;
  store: WorkspaceStore;
  /** Connect-once: the one subscription credential per workspace, served to its sandboxes. */
  credentials: CredentialStore;
  /** Managed gateway store for the active organization's shared local endpoint. */
  sharedEndpoints?: SharedEndpointStore;
  /** Validates per-sandbox HMAC tokens (the sandbox-facing credential endpoint). */
  vault: CredentialVault;
  /** Managed-pod recovery for an absent/dead central credential row. */
  credentialHealer?: CredentialServeHealer;
  /**
   * RuntimeChannel per workspace hosting model (gke → ProxyChannel, cloudrun →
   * TurnChannel; the local profile adds its own in P4). A workspace whose
   * runtime has no channel wired answers 503.
   */
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  /** Workspace file store backing the typed .houston families; absent → those routes 503. */
  vfs?: Vfs;
  /** Where agent files live in the vfs (cloud prefixes vs local tree). Default: cloud. */
  paths?: WorkspacePaths;
  /** Global reactivity fan-out (the `/v1/events` channel); absent → that route 503s. */
  events?: EventHub;
  /** What this deployment can do; served at /v1/capabilities for the UI to gate on. */
  capabilities: Capabilities;
  /**
   * The agent's absolute on-disk directory, when this deployment is co-located
   * with the files (local profile). Serialized as `dir` on agent payloads so
   * the desktop shell can reveal/open in the OS file manager (HOU-677).
   */
  agentDir?: (ws: Workspace, agent: Agent) => string;
  /**
   * True when this install carried over a legacy Rust-desktop chat-history db —
   * i.e. the user is migrating from the old desktop build. Surfaced on
   * `/v1/version` so the desktop UI can show its one-time "reconnect your AI"
   * moment (the migrated provider credentials are not portable). Absent/false on
   * a fresh install and on the cloud profile.
   */
  chatHistoryMigrated?: boolean;
  /**
   * Operator-dashboard request hook (CLOSED surface, injected by the cloud entry
   * point). Omit to disable the `/admin/*` API entirely — the local profile never
   * sets it, so `/admin/*` 404s there.
   */
  mountAdmin?: MountAdmin;
  /** "Send feedback" intake (web build → Linear); omit and POST /feedback answers 503. */
  feedback?: FeedbackSender;
  /** Third-party integrations (Composio, platform mode); absent → integration routes 503. */
  integrations?: IntegrationDeps;
  /**
   * Custom integrations (HOU-550): user-added API/MCP sources compiled to agent
   * tools by the embedded executor engine. Absent → the definition routes 404
   * (client reads that as "unsupported host") and the sandbox setup routes 503.
   */
  customIntegrations?: CustomIntegrationDeps["customIntegrations"];
  /**
   * Installed agent-config library (the create-agent picker's "installed"
   * source + GitHub agent install). Absent → the list reads empty and installs
   * answer 503.
   */
  agentConfigs?: AgentConfigsDeps;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod — same stance as LocalHostOptions.gatewayFronted).
   * Routine writes then record the gateway-minted acting identity (the
   * `x-houston-acting-as` payload sub) as `created_by` instead of this host's
   * single local user id — that sub is what the gateway can re-authorize when
   * the fired routine's integration calls present it (C2 auth mode 3; the
   * pod's local user id has no upstream membership, so it would 401 every
   * call). Leave false on the desktop: an inbound acting header there is
   * untrusted client input and is ignored.
   */
  gatewayFronted?: boolean;
  /**
   * The org owner's canonical user id (the gateway identity directory's sub),
   * stamped into managed pods as env. Routine writes on a gateway-fronted host
   * fall back to it when a request carries no decodable acting-as header, and
   * seed installs stamp it when no acting identity exists — the control-plane
   * fire planner skips any routine without a `created_by`, so no routine may
   * be born authorless. Absent on desktop/self-host (the local user id is the
   * recorded creator there).
   */
  ownerSub?: string;
  /** Gateway-fronted but the egress still reaches loopback (the dev launcher's
   *  on-machine "pods"): skips the managed-cloud public-HTTPS endpoint
   *  validation. See AgentRouteDeps.loopbackEgress. */
  loopbackEgress?: boolean;
  /** Immediate object-storage sync of the pod tree; see AgentRouteDeps.storeSyncFlush. */
  storeSyncFlush?: () => Promise<void>;
  /**
   * Live /agents/* request count (createControlPlaneServer wires it; see the
   * AgentRouteDeps.agentRequestCount doc for why it exists and why it is
   * scoped to the per-agent surface only).
   */
  agentRequestCount?: () => number;
  /**
   * Cross-replica dedup lock for the pod trigger-events route (C9): the Go
   * control plane delivers external events to a managed pod; the lock stops a
   * redelivery double-firing. Absent → that route 503s. Present on every host
   * with a turn bus.
   */
  triggerLock?: TriggerEventLock;
  /** Shared scheduled-instant lock for local scans and CP-delivered fires. */
  routineFireLock?: FireLock;
  /** Scheduled-instant lock TTL. Managed pods use 24h; other profiles 1h. */
  routineFireDedupTtlSec?: number;
  /** File-authoritative transcript writes mirrored through the sandbox facade. */
  transcriptShadow?: TranscriptShadow;
  /**
   * Whether this deployment can fire event-driven routines (a trigger backend —
   * a Composio project key + a public webhook URL — exists). True on Houston
   * Cloud only; false on desktop/self-host. Threaded to the routine write gate
   * and the trigger-status route (see AgentRouteDeps.triggersEnabled). Distinct
   * from `capabilities.triggers`, which the managed gateway advertises at its
   * edge and this host never sets on itself.
   */
  triggersEnabled?: boolean;
  corsOrigin?: string;
  /**
   * Prometheus exposition for GET /metrics (HOU-1011): the boot-span ledger,
   * rendered by prom-client. Token-gated like every non-public route. Absent →
   * the route 404s (a test server without telemetry stays honest).
   */
  metrics?: { render(): Promise<string>; contentType: string };
  /** Managed-store write-fence state; absent on desktop and self-host. */
  storeFenced?: () => boolean;
  /**
   * Materialize a synthetic (dot-named) agent's directory — the personal
   * assistant's home (routes/assistant.ts). Local filesystem profiles only;
   * absent → `GET /v1/assistant` answers 503 instead of handing out an address
   * that resolves to nothing.
   */
  ensureSyntheticAgentDir?: AssistantDeps["ensureSyntheticAgentDir"];
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
