import { runTurnBusContract } from "../testing/turn-bus-contract";
import { MemoryTurnBus } from "./bus";

/**
 * The OPEN TurnBus adapter (MemoryTurnBus, virtual clock) runs through the shared
 * contract (../testing/turn-bus-contract.ts → runTurnBusContract). The CLOSED
 * RedisTurnBus runs the SAME time-independent assertions plus Redis's native
 * EX/NX/TTL semantics in `@houston/host-cloud` (turn/bus-redis.contract.test.ts),
 * against an in-process ioredis-mock — the contract function lives on the open
 * side of the seam; only the adapters differ.
 */

runTurnBusContract("MemoryTurnBus", (now) => new MemoryTurnBus(now));
