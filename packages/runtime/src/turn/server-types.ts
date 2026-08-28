import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { AdmissionLimiter } from "./admission";
import type { applyOp } from "./op-apply";
import type { TurnRunner } from "./turn-session";

/** Injectable dependencies and pool controls for the per-turn HTTP server. */
export interface TurnServerDeps {
  store: ObjectStore;
  /** App-layer token; empty means open local development. */
  token: string;
  runTurn?: TurnRunner;
  /** Test seam for the worker op executor. */
  runOp?: typeof applyOp;
  concurrency?: number;
  admission?: AdmissionLimiter;
  isDraining?: () => boolean;
  /**
   * This pod's OWN downward-API Kubernetes UID (config.podUid). When set, a
   * dispatched /turn or /op whose X-Pool-Pod-UID header does not match is
   * rejected (409) — binding the turn to this exact incarnation so a replacement
   * pod at a reused ordinal+IP refuses a turn meant for the prior pod. A
   * single-use worker fails closed (a missing header is rejected too); empty
   * disables the check (off-cluster / per-agent workers).
   */
  podUid?: string;
  /**
   * Single-use pool lifecycle. `begin` latches the worker spent BEFORE its
   * one claimed turn executes (fail-closed against a mid-turn crash);
   * `settled` fires after that turn's response has ended so the process can
   * shut down and let the orchestrator replace the pod. Only claimed /turn
   * requests spend the worker — /op is a host-side write that runs no
   * model-directed code.
   */
  singleUse?: {
    begin: () => Promise<void>;
    settled: () => void;
  };
  poolStoreUrl?: string;
  turnLogUrl?: string;
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
  maxHydrateBytes?: number;
  /** Test seam: transient-status retry delays for transcript publication. */
  transcriptRetryDelaysMs?: number[];
  /** Test seam: transient-status retry delays for activity doc publication. */
  activityDocRetryDelaysMs?: number[];
}
