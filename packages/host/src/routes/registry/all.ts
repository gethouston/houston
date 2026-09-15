/**
 * The barrel that makes the registry complete.
 *
 * Every module that declares routes is imported here for its side effect, and
 * server.ts reaches `dispatchGroup` only through this file — so a module that
 * is registered but unreachable, or reachable but unregistered, cannot exist.
 * `listRoutes()` is re-exported for the same reason: the SDK parity gate reads
 * the registry through this barrel and therefore always sees all of it.
 *
 * Import order is documentation, not behaviour: matching order is the group
 * order in registry/types.ts's GROUP_PHASES, which mirrors server.ts's chain.
 */
import "../meta";
import "../catalog";
import "../events-stream";
import "../pod-activity";
import "../metrics";
import "../feedback";
import "../agents";

export { dispatchGroup, listRoutes } from "./index";
