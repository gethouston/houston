import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { AdmissionLimiter } from "./admission";
import type { runPiTurn } from "./turn-session";

/** Injectable dependencies and pool controls for the per-turn HTTP server. */
export interface TurnServerDeps {
  store: ObjectStore;
  /** App-layer token; empty means open local development. */
  token: string;
  runTurn?: typeof runPiTurn;
  concurrency?: number;
  admission?: AdmissionLimiter;
  isDraining?: () => boolean;
  poolStoreUrl?: string;
  turnLogUrl?: string;
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
  maxHydrateBytes?: number;
  /** Test seam: transient-status retry delays for transcript publication. */
  transcriptRetryDelaysMs?: number[];
}
