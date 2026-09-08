import type {
  ManifestObjectStore,
  ObjectStore,
} from "@houston/runtime-client/object-sync";
import type { PodGatewayConfig } from "../pod-gateway";
import type { RoutineSchedulerMode } from "../schedule/scheduler";

export interface ManagedHostOptions {
  /**
   * Managed pod credential gateway. When present, provider credentials live at
   * the org level in the gateway (single refresher); the local file is only a
   * one-time adoption fallback for pods that already captured a legacy credential.
   */
  credentials?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /** Managed-pod organization endpoint gateway. Absent on desktop/self-host. */
  sharedEndpoints?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /**
   * Integration wiring (platform model):
   *  - `gatewayUrl`: Houston's cloud host; the desktop forwards with the user's
   *    Supabase session, so no provider key ever lives on this machine.
   *  - `composioApiKey`: a DIRECT platform key — self-host/dev only, where the
   *    operator owns the key. Never ship a shared key to end-user desktops.
   * Both set → the gateway wins. Neither → integrations off (empty capability
   * list, routes 503).
   *
   * `podToken` (managed pods only, env `HOUSTON_HOST_TOKEN`) lets the gateway
   * adapter authenticate a routine turn as its creator (C2, auth mode b). Absent
   * on the desktop — a routine turn there has no way to act as the creator, so it
   * falls through to signin-required.
   */
  integrations?: {
    gatewayUrl?: string;
    composioApiKey?: string;
    podToken?: string;
  };
  /**
   * Passive mode (env `HOUSTON_PASSIVE=1`): boot migrations + serve, but keep
   * the scheduler and the FS watcher OFF. The one-click migration (HOU-719)
   * spawns this host briefly against the old `~/.houston` purely to convert
   * and read data — a read-only source must never fire routines (spawning
   * credential-less runtimes) or churn watch events while the cloud app copies.
   */
  passive?: boolean;
  /** Cron ownership. `external` keeps reconcile alive but skips local fires. */
  routineSchedulerMode?: RoutineSchedulerMode;
  /**
   * True when a control-plane fire scheduler also delivers scheduled routine
   * instants to this host (`/agents/:id/routine-fires`) — the managed-cloud
   * topology, NOT self-host (which sets HOUSTON_MANAGED_CLOUD without any
   * control plane). That delivery carries the creator's minted acting
   * identity, so its turn runs on the creator's own credentials; the local
   * cron path can only run on the shared team scope. When true, local cron
   * fires wait out EXTERNAL_FIRE_GRACE_MS so the delivery wins every live
   * race and the local scan stays a backstop for delivery outages.
   */
  externalRoutineFires?: boolean;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod: the gateway enforces the pod token and mints/strips
   * `x-houston-acting-as` itself). Relays that header to the runtime so a
   * turn's integration calls authenticate as the driving user (C2). On the
   * desktop clients reach this host directly, so an inbound acting header is
   * untrusted client input — leave this false (the default) and it is dropped.
   */
  gatewayFronted?: boolean;
  /**
   * The org owner's canonical user id (the gateway identity directory's sub),
   * stamped into managed pods as owner env. Managed pods only, two uses: the
   * boot backfill stamps it as `created_by` on routines recorded before acting
   * identities were stamped, and routine writes fall back to it when a request
   * carries no decodable acting-as header — the control-plane fire planner
   * skips any routine without a creator, so no routine may be authorless.
   */
  ownerSub?: string;
  /**
   * Whether this deployment can fire event-driven routines: a trigger backend
   * (a Composio project key + a public webhook URL) exists, so a routine's
   * `trigger` binding can actually wake. True on Houston Cloud only; false
   * (default) on desktop and self-host, which carry no trigger backend. Drives
   * the routine write gate and the trigger-status route (and the product prompt,
   * built in local/main.ts). Distinct from the CLIENT-facing
   * `capabilities.triggers`, advertised by the managed gateway at its edge.
   */
  triggersEnabled?: boolean;
  /** Gateway-fronted but the egress still reaches loopback (dev launcher
   *  only): skips the managed-cloud public-HTTPS endpoint validation. */
  loopbackEgress?: boolean;
  /** Managed-pod cache persistence. Omit to preserve the local/PVC lifecycle. */
  storeSync?: {
    store: ObjectStore;
    quietMs?: number;
    intervalMs?: number;
    maxHydrateBytes?: number;
    /** Gateway's explicit generation-precondition capability (boot lease). */
    generations?: boolean;
  };
  /** Managed-pod read/write org prefix mirror, outside the agent workspace. */
  sharedMirror?: {
    store: ManifestObjectStore;
    mirrorDir: string;
    /** Gateway's explicit generation-precondition capability (boot lease). */
    generations?: boolean;
  };
  /**
   * Managed-pod active-time reporting: sample this pod's busy state and report
   * per-day totals to the gateway's compute-usage ingest. Same env quadruple as
   * `credentials` — absent on desktop/self-host, where no sampler ever runs.
   */
  usageReporting?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  /**
   * How long `stop()` lets in-flight turns finish before the runtimes are
   * killed and the final sync runs. Managed pods set it from their
   * termination grace (leaving the sync its share); absent = the short
   * desktop default, where the app that owned this host is already gone.
   */
  shutdownDrainMs?: number;
  /** Managed durable-turn shadows. Both switches are explicit rollout caps. */
  durableTurns?: {
    gateway: PodGatewayConfig;
    /**
     * Turnlog ingest lives on the GATEWAY (it owns the Redis streams), not on
     * the pod store `gateway` points at — batches sent there 404. Absent =
     * fall back to `gateway` for old control planes that predate
     * HOUSTON_TURNLOG_URL; the sender's failure path already tolerates it.
     */
    turnlogGateway?: PodGatewayConfig;
    transcriptDualWrite: boolean;
    turnLog: boolean;
  };
}
