import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { runPiTurn } from "./turn-session";

/** Injectable dependencies and pool controls for the per-turn HTTP server. */
export interface TurnServerDeps {
  store: ObjectStore;
  /** App-layer token; empty means open local development. */
  token: string;
  runTurn?: typeof runPiTurn;
  concurrency?: number;
  poolStoreUrl?: string;
  turnLogUrl?: string;
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
}
