import { runTurnBusContract } from "../testing/turn-bus-contract";
import { MemoryTurnBus } from "./bus";

runTurnBusContract("MemoryTurnBus", (now) => new MemoryTurnBus(now));
