/**
 * The door a route module declares through: `defineRoute` and friends, the
 * group ids, and the matcher helpers. Nothing here reads the registry back —
 * `dispatchGroup` and `listRoutes` live in ./dispatch and are published by
 * ./all, so a route module cannot reach the chain it is declared into.
 */
export type { AgentCtx, PublicCtx, UserCtx } from "./context";
export {
  defineProxyFamily,
  defineRoute,
  defineRouteFamily,
  registeredRoutes,
} from "./define";
export type { GroupId } from "./groups";
export { GROUP_ORDER, GROUP_PHASES } from "./groups";
export { generalises, matchPath, patternParams } from "./match";
export type {
  Classification,
  HttpMethod,
  RouteDescriptor,
} from "./types";
