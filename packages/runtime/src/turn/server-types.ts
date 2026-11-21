import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { AdmissionLimiter } from "./admission";
import type { applyOp } from "./op-apply";
import type { TurnCredentialWriter } from "./turn-credential";
import type { ProviderWarmer } from "./turn-provider-warm";
import type { TurnRunner } from "./turn-session";
import type { RunTurnDeps } from "./turn-session-startup";
import type { turnSharedSkillsStore } from "./turn-shared-skills";

export interface TurnServerDeps {
  store: ObjectStore;
  loginRunner?: import("./login-runner").LoginRunner;
  token: string;
  runTurn?: TurnRunner;
  turnSessionDeps?: RunTurnDeps;
  writeTurnCredential?: TurnCredentialWriter;
  removeTurnRoot?: (root: string) => Promise<void>;
  hydrationSettleTimeoutMs?: number;
  providerWarmer?: ProviderWarmer;
  runOp?: typeof applyOp;
  concurrency?: number;
  admission?: AdmissionLimiter;
  isDraining?: () => boolean;
  podUid?: string;
  singleUse?: {
    begin: () => Promise<void>;
    settled: () => void;
  };
  poolStoreUrl?: string;
  sharedSkillsStore?: typeof turnSharedSkillsStore;
  turnLogUrl?: string;
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
  maxHydrateBytes?: number;
  transcriptRetryDelaysMs?: number[];
  activityDocRetryDelaysMs?: number[];
  stopMarkerTimeoutMs?: number;
}
