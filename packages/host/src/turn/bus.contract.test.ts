import { runTurnBusContract } from "../testing/turn-bus-contract";
import { MemoryTurnBus } from "./bus";

/**
 * The OPEN TurnBus adapter (MemoryTurnBus, virtual clock) runs through the shared
 * contract (../testing/turn-bus-contract.ts → runTurnBusContract). The closed
 * RedisTurnBus and its Redis-native EX/NX/TTL suite were retired with
 * `@houston/host-cloud` (git history) — the contract stays open as the
 * behavioral bar for any out-of-repo adapter.
 */

runTurnBusContract("MemoryTurnBus", (now) => new MemoryTurnBus(now));
