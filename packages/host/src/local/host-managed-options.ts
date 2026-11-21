import type {
  LeaseHolderState,
  ManifestObjectStore,
  ObjectStore,
  WriteLeaseVerdict,
} from "@houston/runtime-client/object-sync";
import type { PodGatewayConfig } from "../pod-gateway";
import type { RoutineSchedulerMode } from "../schedule/scheduler";

export interface ManagedHostOptions {
  credentials?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  sharedEndpoints?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  integrations?: {
    gatewayUrl?: string;
    composioApiKey?: string;
    podToken?: string;
  };
  passive?: boolean;
  routineSchedulerMode?: RoutineSchedulerMode;
  externalRoutineFires?: boolean;
  gatewayFronted?: boolean;
  ownerSub?: string;
  triggersEnabled?: boolean;
  loopbackEgress?: boolean;
  storeSync?: {
    store: ObjectStore;
    quietMs?: number;
    intervalMs?: number;
    maxHydrateBytes?: number;
    generations?: boolean;
    leaseProbe?: () => Promise<WriteLeaseVerdict>;
    leaseClaimed?: () => boolean;
    leaseHeartbeatMs?: number;
  };
  onStoreFenceLost?: (holder: LeaseHolderState) => void;
  sharedMirror?: {
    store: ManifestObjectStore;
    mirrorDir: string;
    generations?: boolean;
  };
  usageReporting?: {
    url: string;
    orgSlug: string;
    agentSlug: string;
    podToken: string;
  };
  shutdownDrainMs?: number;
  durableTurns?: {
    gateway: PodGatewayConfig;
    turnlogGateway?: PodGatewayConfig;
    transcriptDualWrite: boolean;
    turnLog: boolean;
  };
}
