import { config } from "../config";
import { httpSandboxFetch, type SandboxFetch } from "./tools/sandbox-fetch";

/**
 * This runtime's transport to its own host's `/sandbox/*` routes, built once
 * from the process config. `null` when the pair that authenticates it is absent
 * (a bare runtime with no host in front of it) — every caller treats that as
 * "the host is not reachable" and simply does without.
 *
 * It lives in its own module because BOTH the tool wiring (conversation-cache,
 * whose module load builds the backends) and the turn path (exec-turn's
 * compaction fact harvest) need it: importing the cache for it would drag those
 * load-time side effects into the turn's import graph.
 */
export const sandboxCall: SandboxFetch | null =
  config.controlPlaneUrl && config.sandboxToken
    ? httpSandboxFetch(config.controlPlaneUrl, config.sandboxToken)
    : null;
